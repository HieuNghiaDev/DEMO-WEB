<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CaseFileController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['case_files' => CaseFile::query()
            ->with(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])
            ->withCount([
                'documents',
                'documents as confirmed_documents_count' => fn ($query) => $query
                    ->where('status', 'confirmed'),
            ])
            ->latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $this->resolveCaseType($data);

        $caseFile = DB::transaction(function () use ($data, $request): CaseFile {
            $clientData = Arr::pull($data, 'client');

            if ($clientData) {
                $data['client_id'] = Client::query()->create($clientData)->id;
            }

            $data['created_by_employee_id'] = $request->user()?->employee_id;

            return CaseFile::query()->create($data);
        });

        return response()->json(['case_file' => $caseFile->load(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])], 201);
    }

    public function show(CaseFile $caseFile): JsonResponse
    {
        $caseFile->loadCount([
            'documents',
            'documents as confirmed_documents_count' => fn ($query) => $query
                ->where('status', 'confirmed'),
        ]);

        return response()->json(['case_file' => $caseFile->load([
            'client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee', 'documents.createdByEmployee',
            'precedents.createdByEmployee', 'meetingLogs.createdByEmployee',
        ])]);
    }

    public function update(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $this->validated($request, true);
        $this->resolveCaseType($data);
        $caseFile->update($data);

        return response()->json(['case_file' => $caseFile->load(['client', 'caseTypeOption', 'department', 'assignedEmployee', 'createdByEmployee'])]);
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
            'client.client_type' => ['nullable', Rule::in(['individual', 'corporate'])],
            'department_id' => ['nullable', 'exists:departments,id'],
            'assigned_employee_id' => ['nullable', 'exists:employees,id'],
            'status' => ['nullable', Rule::in([
                'intake', 'active', 'waiting_documents', 'reviewing', 'waiting_payment', 'on_hold', 'closed',
            ])],
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
}
