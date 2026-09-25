<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Client;
use App\Models\ClientEmployment;
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
    public function index(): JsonResponse
    {
        return response()->json(['case_files' => CaseFile::query()
            ->with(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])
            ->withCount($this->documentProgressCounts())
            ->latest()->get()]);
    }

    public function store(Request $request, GoogleDriveProvisioningService $drive): JsonResponse
    {
        $data = $this->validated($request);

        if (! empty($data['assigned_employee_id'])) {
            $this->ensureCanAssignCase($request);
        }

        $this->resolveCaseType($data);

        $caseFile = DB::transaction(function () use ($data, $request): CaseFile {
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

            return CaseFile::query()->create($data);
        });

        // Checklist initialization is an explicit action, never a side effect of case creation.
        return response()->json([
            'case_file' => $caseFile->load(['client.employments', 'caseTypeOption.parent', 'department', 'assignedEmployee', 'createdByEmployee'])->loadCount($this->documentProgressCounts()),
            'drive' => $this->attemptDriveProvisioning($caseFile, $drive),
        ], 201);
    }

    public function show(CaseFile $caseFile): JsonResponse
    {
        $caseFile->loadCount($this->documentProgressCounts());

        return response()->json(['case_file' => $caseFile->load([
            'client.employments', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee', 'documents.createdByEmployee',
            'precedents.createdByEmployee', 'meetingLogs.createdByEmployee', 'customSections.createdByEmployee',
            'parties', 'activities.createdByEmployee',
        ])]);
    }

    public function update(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $this->validated($request, true);

        if (array_key_exists('assigned_employee_id', $data)) {
            $this->ensureCanAssignCase($request);
        }

        $this->resolveCaseType($data);
        $caseFile->update($data);

        return response()->json(['case_file' => $caseFile->load(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])]);
    }

    public function assign(Request $request, CaseFile $caseFile): JsonResponse
    {
        $this->ensureCanAssignCase($request);

        $data = $request->validate([
            'assigned_employee_id' => ['nullable', 'exists:employees,id'],
        ]);

        $caseFile->update($data);

        return response()->json([
            'case_file' => $caseFile->load(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee']),
        ]);
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
            $request->user()?->hasAnyRole(['level_4', 'level_5']),
            403,
            '案件の担当者を変更できるのはレベル4以上のユーザーのみです。'
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
