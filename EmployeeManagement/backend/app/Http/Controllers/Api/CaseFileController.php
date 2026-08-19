<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CaseFileController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['case_files' => CaseFile::query()
            ->with(['client', 'department', 'assignedEmployee'])
            ->withCount([
                'documents',
                'documents as confirmed_documents_count' => fn ($query) => $query
                    ->whereIn('status', ['confirmed', 'submitted']),
            ])
            ->latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $caseFile = CaseFile::create($this->validated($request));

        return response()->json(['case_file' => $caseFile->load(['client', 'department', 'assignedEmployee'])], 201);
    }

    public function show(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['case_file' => $caseFile->load([
            'client', 'department', 'assignedEmployee', 'documents.createdByEmployee',
            'precedents.createdByEmployee', 'meetingLogs.createdByEmployee',
        ])]);
    }

    public function update(Request $request, CaseFile $caseFile): JsonResponse
    {
        $caseFile->update($this->validated($request, true));

        return response()->json(['case_file' => $caseFile->load(['client', 'department', 'assignedEmployee'])]);
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
            'case_type' => ['nullable', 'string', 'max:100'],
            'client_id' => [$partial ? 'sometimes' : 'required', 'exists:clients,id'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'assigned_employee_id' => ['nullable', 'exists:employees,id'],
            'status' => ['nullable', Rule::in([
                'intake', 'active', 'waiting_documents', 'reviewing', 'waiting_payment', 'on_hold', 'closed',
            ])],
        ]);
    }
}
