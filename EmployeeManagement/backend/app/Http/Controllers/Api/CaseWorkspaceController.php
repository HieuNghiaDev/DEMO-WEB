<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCaseIncidentRequest;
use App\Models\CaseFile;
use App\Services\CaseDocumentChecklistService;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class CaseWorkspaceController extends Controller
{
    public function show(Request $request, CaseFile $caseFile): JsonResponse
    {
        $caseFile->load([
            'client.employments', 'caseTypeOption.parent', 'department', 'assignedEmployee', 'createdByEmployee',
            'documents.createdByEmployee', 'documents.confirmedByEmployee', 'documents.templateItem',
            // CaseDocument::toArray checks these relations for task-metadata privacy.
            // Batch-load them rather than issuing three lazy lookups per document.
            'documents.activeCaseTask', 'documents.latestCaseTask', 'documents.latestEmployeeTask',
            'parties', 'deadlines',
            'caseTasks' => fn ($q) => $q->visibleTo($request->user())->with([
                'assignedEmployee:id,full_name,avatar_path',
                'caseDocument.documentType:id,code,name_ja,handling_type',
                'latestSubmission.submittedBy:id,name',
                'latestSubmission.reviewedBy:id,name',
                'submissions.submittedBy:id,name',
                'submissions.reviewedBy:id,name',
            ]),
            'activities' => fn ($q) => $q->visibleTaskData($request->user())->with('createdByEmployee')->limit(50),
        ]);

        $documents = $caseFile->documents;
        $activeDocuments = $documents->where('status', '!=', 'not_required');
        $required = $activeDocuments->where('requirement_level', 'required');
        $completeStatuses = ['confirmed', 'submitted'];
        $completedRequired = $required->whereIn('status', $completeStatuses)->count();
        $nextDeadline = $caseFile->deadlines->where('status', 'open')->sortBy('due_at')->first();

        return response()->json([
            'case_file' => $caseFile,
            'can_decide_document_necessity' => $request->user()->can('decideDocumentNecessity', $caseFile),
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

    public function updateIncident(UpdateCaseIncidentRequest $request, CaseFile $caseFile, CaseWorkspaceAuditService $audit): JsonResponse
    {
        DB::transaction(function () use ($request, $caseFile, $audit): void {
            $data = $request->validated();
            if (! empty($data['occurred_at'])) {
                // Eloquent stores timestamps in the app timezone; preserve the instant sent by the browser.
                $data['occurred_at'] = Carbon::parse($data['occurred_at'])
                    ->setTimezone(config('app.timezone'))
                    ->format('Y-m-d H:i:s');
            }
            $caseFile->update($data);
            $audit->record($caseFile, $request, '事故・事件概要を更新');
        });

        return response()->json(['case_file' => $caseFile->fresh()]);
    }
}
