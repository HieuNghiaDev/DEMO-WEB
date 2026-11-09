<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Client;
use App\Models\ClientEmployment;
use App\Services\CaseWorkspaceAuditService;
use App\Services\GoogleDriveProvisioningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class CaseFileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['case_files' => CaseFile::query()
            ->visibleTo($request->user())
            ->with(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])
            ->withCount($this->documentProgressCounts())
            ->latest()->get()]);
    }

    public function store(Request $request, GoogleDriveProvisioningService $drive): JsonResponse
    {
        $data = $this->validated($request);
        if (($data['status'] ?? null) === 'closed' && \App\Services\Administration\MainRoles::assigned($request->user())) {
            abort_unless($request->user()->hasPermission('case.delete'), 403, '案件を終了する権限がありません。');
        }

        $classification = Arr::pull($data, 'classification');
        // Operational membership admission has not been approved. Reject before any write/provider call.
        if ($classification === 'confidential') {
            return response()->json([
                'code' => 'confidential_case_admission_pending',
                'message' => '機密案件のアクセスメンバー設定は現在準備中です。',
            ], 409);
        }

        if (! empty($data['assigned_employee_id'])) {
            $this->ensureCanAssignCase($request);
        }

        $this->resolveCaseType($data);

        $caseFile = DB::transaction(function () use ($data, $request, $classification): CaseFile {
            $clientData = Arr::pull($data, 'client');
            $employments = Arr::pull($data, 'employments', []);

            if ($clientData) {
                $data['client_id'] = Client::query()->create($clientData)->id;
            }

            $client = Client::query()->findOrFail($data['client_id']);
            if ($employments !== []) {
                $client->employments()->createMany(array_map(function (array $employment): array {
                    $employment['is_current'] = (bool) $employment['is_current'];
                    if ($employment['is_current']) {
                        $employment['end_date'] = null;
                        if ($employment['employment_status'] === 'former') {
                            $employment['employment_status'] = 'employed';
                        }
                    } elseif ($employment['employment_status'] === 'employed') {
                        $employment['employment_status'] = 'former';
                    }

                    return $employment;
                }, $employments));
            }

            $data['created_by_employee_id'] = $request->user()?->employee_id;

            // Keep the storage flag guarded; only this validated create contract classifies the new record.
            $caseFile = new CaseFile($data);
            $caseFile->is_confidential = false;
            $caseFile->save();
            app(CaseWorkspaceAuditService::class)->record($caseFile, $request, '案件を作成', $caseFile->title, [
                'event' => 'case.created', 'classification' => $classification,
            ]);

            return $caseFile;
        });

        // Checklist initialization is an explicit action, never a side effect of case creation.
        return response()->json([
            'case_file' => $caseFile->load(['client.employments', 'caseTypeOption.parent', 'department', 'assignedEmployee', 'createdByEmployee'])->loadCount($this->documentProgressCounts()),
            'drive' => $this->attemptDriveProvisioning($caseFile, $drive),
        ], 201);
    }

    public function show(Request $request, CaseFile $caseFile): JsonResponse
    {
        $caseFile->loadCount($this->documentProgressCounts());

        return response()->json(['case_file' => $caseFile->load([
            'client.employments', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee', 'documents.createdByEmployee',
            'precedents.createdByEmployee', 'meetingLogs.createdByEmployee', 'customSections.createdByEmployee',
            'parties', 'activities' => fn ($q) => $q->visibleTaskData($request->user())->with('createdByEmployee'),
        ])]);
    }

    public function update(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $this->validated($request, true);
        if (($data['status'] ?? null) === 'closed' && $caseFile->status !== 'closed'
            && \App\Services\Administration\MainRoles::assigned($request->user())) {
            abort_unless($request->user()->hasPermission('case.delete'), 403, '案件を終了する権限がありません。');
        }

        if (array_key_exists('assigned_employee_id', $data)) {
            $this->ensureCanAssignCase($request);
        }

        $this->resolveCaseType($data);
        $caseFile = $this->updateWithHistory($caseFile, $request, $data, '案件情報を更新');

        return response()->json(['case_file' => $caseFile->load(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])]);
    }

    public function assign(Request $request, CaseFile $caseFile): JsonResponse
    {
        $this->ensureCanAssignCase($request);

        $data = $request->validate([
            'assigned_employee_id' => ['nullable', 'exists:employees,id'],
        ]);

        $caseFile = $this->updateWithHistory($caseFile, $request, $data, '案件担当者を変更');

        return response()->json([
            'case_file' => $caseFile->load(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee']),
        ]);
    }

    private function updateWithHistory(CaseFile $caseFile, Request $request, array $data, string $title): CaseFile
    {
        return DB::transaction(function () use ($caseFile, $request, $data, $title) {
            $caseFile = CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $before = $caseFile->only(array_keys($data));
            $caseFile->fill($data);
            if ($caseFile->isDirty()) {
                $caseFile->save();
                app(CaseWorkspaceAuditService::class)->record($caseFile, $request, $title, $caseFile->title, [
                    'event' => 'case.updated', 'before' => $before, 'after' => $caseFile->only(array_keys($data)),
                ]);
            }

            return $caseFile;
        });
    }

    public function provisionDrive(CaseFile $caseFile, GoogleDriveProvisioningService $drive): JsonResponse
    {
        return response()->json(['drive' => $this->attemptDriveProvisioning($caseFile, $drive)]);
    }

    public function destroy(CaseFile $caseFile): JsonResponse
    {
        $caseFile->delete();

        return response()->json(['message' => '案件を削除しました。']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'classification' => [$partial ? 'prohibited' : 'required', 'string', Rule::in(['normal', 'confidential'])],
            'is_confidential' => ['prohibited'],
            'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'case_type' => [$partial ? 'sometimes' : 'prohibited'],
            'case_type_id' => [$partial ? 'sometimes' : 'required', 'integer', Rule::exists('case_types', 'id')->where('is_active', true)],
            'case_type_other' => ['nullable', 'string', 'max:255'],
            'client_id' => [$partial ? 'sometimes' : 'nullable', 'required_without:client', 'exists:clients,id'],
            'client' => [$partial ? 'prohibited' : 'required_without:client_id', 'array'],
            'client.name' => ['required_with:client', 'string', 'max:255'],
            'client.name_kana' => ['nullable', 'string', 'max:255'],
            'client.birth_date' => ['nullable', 'date_format:Y-m-d'],
            'client.client_type' => ['nullable', Rule::in(['individual', 'corporate'])],
            'client.phone' => ['nullable', 'string', 'max:30'],
            'client.email' => ['nullable', 'email', 'max:255'],
            'client.address' => ['nullable', 'string', 'max:255'],
            'client.nationality' => ['nullable', 'string', 'max:50'],
            'client.notes' => ['nullable', 'string'],
            'employments' => [$partial ? 'prohibited' : 'sometimes', 'array', 'max:20'],
            'employments.*.company_name' => ['required', 'string', 'max:255'],
            'employments.*.company_address' => ['required', 'string', 'max:255'],
            'employments.*.company_phone' => ['nullable', 'string', 'max:30'],
            'employments.*.employment_status' => ['required', Rule::in(ClientEmployment::STATUSES)],
            'employments.*.start_date' => ['nullable', 'date'],
            'employments.*.end_date' => ['nullable', 'date', 'after_or_equal:employments.*.start_date'],
            'employments.*.is_current' => ['required', 'boolean'],
            'employments.*.notes' => ['nullable', 'string', 'max:2000'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'assigned_employee_id' => ['nullable', 'exists:employees,id'],
            'status' => ['nullable', Rule::in([
                'intake', 'active', 'waiting_documents', 'reviewing', 'waiting_payment', 'on_hold', 'closed',
            ])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high', 'critical'])],
            'summary' => ['nullable', 'string', 'max:10000'],
            'opened_at' => ['nullable', 'date'],
            'target_completion_at' => ['nullable', 'date'],
        ]);
    }

    private function resolveCaseType(array &$data): void
    {
        if (! array_key_exists('case_type_id', $data)) {
            return;
        }

        $caseType = CaseType::query()->findOrFail($data['case_type_id']);
        $other = trim((string) ($data['case_type_other'] ?? ''));

        if ($caseType->name === 'その他' && $other === '') {
            throw ValidationException::withMessages([
                'case_type_other' => '「その他」を選択した場合は、案件種別の詳細を入力してください。',
            ]);
        }

        $data['case_type'] = $caseType->name;
        $data['case_type_other'] = $caseType->name === 'その他' ? $other : null;
    }

    private function ensureCanAssignCase(Request $request): void
    {
        abort_unless(
            $request->user()?->hasPermission('case.assign') && (\App\Services\Administration\MainRoles::assigned($request->user())
                || $request->user()?->hasAnyRole(['level_4', 'level_5'])),
            403,
            '案件の担当者を変更する権限がありません。'
        );
    }

    private function documentProgressCounts(): array
    {
        return [
            // List progress is driven exclusively by the V2 collection axes, not legacy document.status.
            'documents' => fn ($query) => $query->where('necessity_status', 'required'),
            'documents as confirmed_documents_count' => fn ($query) => $query
                ->where('necessity_status', 'required')
                ->whereIn('fulfillment_status', ['satisfied', 'satisfied_by_alternative'])
                ->where('review_status', 'reviewed'),
        ];
    }

    private function attemptDriveProvisioning(CaseFile $caseFile, GoogleDriveProvisioningService $drive): array
    {
        try {
            $location = $drive->provisionCaseStructure($caseFile);

            return ['status' => 'ready', 'url' => $location->external_url];
        } catch (Throwable $error) {
            Log::warning('Case Google Drive provisioning failed.', [
                'case_file_id' => $caseFile->id,
                'exception' => $error::class,
            ]);

            return ['status' => 'failed', 'url' => null, 'retryable' => true];
        }
    }
}
