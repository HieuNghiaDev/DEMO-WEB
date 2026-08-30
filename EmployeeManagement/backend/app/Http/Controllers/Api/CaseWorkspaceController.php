<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Services\CaseDocumentChecklistService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CaseWorkspaceController extends Controller
{
    public function show(CaseFile $caseFile): JsonResponse
    {
        $caseFile->load([
            'client', 'caseTypeOption.parent', 'department', 'assignedEmployee', 'createdByEmployee',
            'documents.createdByEmployee', 'documents.confirmedByEmployee', 'documents.templateItem',
            'parties', 'deadlines', 'caseTasks.assignedEmployee', 'activities.createdByEmployee',
        ]);

        $documents = $caseFile->documents;
        $activeDocuments = $documents->where('status', '!=', 'not_required');
        $required = $activeDocuments->where('requirement_level', 'required');
        $completeStatuses = ['confirmed', 'submitted'];
        $completedRequired = $required->whereIn('status', $completeStatuses)->count();
        $nextDeadline = $caseFile->deadlines->where('status', 'open')->sortBy('due_at')->first();

        return response()->json([
            'case_file' => $caseFile,
            'summary' => [
                'progress_percent' => $required->count() === 0 ? 0 : (int) round(($completedRequired / $required->count()) * 100),
                'missing_documents' => $required->whereNotIn('status', $completeStatuses)->count(),
                'documents_total' => $activeDocuments->count(),
                'next_deadline' => $nextDeadline?->due_at,
                'open_tasks' => $caseFile->caseTasks->whereNotIn('status', ['completed', 'cancelled'])->count(),
            ],
        ]);
    }

    public function applyTemplate(Request $request, CaseFile $caseFile, CaseDocumentChecklistService $service): JsonResponse
    {
        $created = $service->applyDefaultTemplate($caseFile);

        return response()->json([
            'message' => $created > 0 ? "{$created}件の必要書類を追加しました。" : '追加できる新しい必要書類はありません。',
            'created_count' => $created,
        ]);
    }
}
