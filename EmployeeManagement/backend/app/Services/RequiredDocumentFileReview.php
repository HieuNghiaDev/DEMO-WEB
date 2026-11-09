<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseTaskSubmission;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class RequiredDocumentFileReview
{
    public const REASONS = ['内容に不足がある', 'ファイルが不鮮明', '誤った資料', '最新版が必要', 'その他'];

    /** Only safe file/progress metadata; task descriptions remain private. */
    public function current(CaseDocument $document): ?array
    {
        $submission = $document->latestTaskSubmission;
        $received = $document->relationLoaded('receivedDocuments')
            ? $document->receivedDocuments->where('case_file_id', $document->case_file_id)->sortByDesc(fn ($file) => [$file->version, $file->id])->first()
            : $document->receivedDocuments()->where('received_documents.case_file_id', $document->case_file_id)
                ->orderByDesc('version')->orderByDesc('received_documents.id')->first();
        $generatedVersion = $document->relationLoaded('generatedDocuments')
            ? (int) $document->generatedDocuments->filter(fn ($version) => $version->artifacts->isNotEmpty())->max('version')
            : (int) $document->generatedDocuments()->whereHas('artifacts')->max('version');
        $preferSubmission = $submission && ($submission->version > ($received?->version ?? 0)
            || ($submission->version === ($received?->version ?? 0)
                && ($submission->received_document_id === $received?->id || $submission->submitted_at >= $received?->created_at)));
        $file = $preferSubmission ? $submission : $received;
        if (CaseAccessService::rehearsal() && $file instanceof CaseTaskSubmission && $file->case_generated_document_id !== null) {
            return null; // A manual label cannot turn a generated/legal link into ordinary file review.
        }
        if (! $file || $file->version < $generatedVersion
            || ($file instanceof CaseTaskSubmission && $file->source_type !== 'manual_upload')) {
            return null;
        }
        $reviewer = $file->reviewedBy;
        $task = $document->activeCaseTask ?? $document->latestCaseTask;
        // Legacy uploads had no per-file review. Offer review of an unreviewed
        // latest file without inventing a past confirmation, reviewer, or upload event.
        $status = $file->review_status;
        if (! ($file instanceof CaseTaskSubmission) && $status === null
            && in_array($document->review_status, ['unreviewed', 'reviewing'], true)) {
            $status = 'pending_review';
        }
        $activeTask = $document->activeCaseTask;
        $legacyTask = $file->review_status === null && $activeTask
            && in_array($activeTask->status, ['in_progress', 'changes_requested', 'pending_review'], true)
            && ! $activeTask->latestSubmission;
        $reviewable = $status === 'pending_review' && ($file instanceof CaseTaskSubmission
            ? $task && ! $task->trashed() && $task->id === $file->case_task_id && $task->status === 'pending_review'
            : ! $activeTask || $legacyTask);
        if (LegalFinalizationGate::policyPending() && $file instanceof CaseTaskSubmission && $file->case_generated_document_id !== null) {
            $reviewable = false;
        }

        return [
            'source' => $file instanceof CaseTaskSubmission ? 'task_submission' : 'received',
            'id' => $file->id, 'version' => $file->version, 'status' => $status,
            'task_id' => $file instanceof CaseTaskSubmission ? $file->case_task_id : null,
            'reviewable' => (bool) $reviewable,
            'filename' => $file instanceof CaseTaskSubmission ? $file->filename : ($file->original_filename ?: $file->title),
            'mime_type' => $file instanceof CaseTaskSubmission ? $file->mime_type : null,
            'uploaded_at' => ($file instanceof CaseTaskSubmission ? $file->submitted_at : $file->created_at)?->toISOString(),
            'reason' => $file->review_reason ?? ($file instanceof CaseTaskSubmission ? $file->review_note : null),
            'detail' => $file->review_detail,
            'reviewed_by' => $reviewer ? ['id' => $reviewer->id, 'name' => $reviewer->name] : null,
            'reviewed_at' => $file->reviewed_at?->toISOString(),
            'returned_by' => $file->review_status === 'rejected' && $reviewer ? ['id' => $reviewer->id, 'name' => $reviewer->name] : null,
            'returned_at' => $file->review_status === 'rejected' ? $file->reviewed_at?->toISOString() : null,
            'confirmed_at' => $file->review_status === 'approved' ? $file->reviewed_at?->toISOString() : null,
        ];
    }

    public function review(CaseFile $case, CaseDocument $document, Request $request, array $data): void
    {
        $case->getConnection()->transaction(function () use ($case, $document, $request, $data): void {
            CaseAccessService::rehearsal()?->authorizeWrite($request->user(), $case->id);
            CaseFile::whereKey($case->id)->lockForUpdate()->firstOrFail();
            $document = CaseDocument::whereKey($document->id)->where('case_file_id', $case->id)->lockForUpdate()->firstOrFail();
            abort_unless($case->isVisibleTo($request->user()) && $request->user()->hasPermission('task.review'), 403);
            $current = $this->current($document);
            if (! $current || $current['source'] !== $data['source'] || $current['id'] !== $data['file_id']
                || ! $current['reviewable']) {
                throw ValidationException::withMessages(['file_id' => '現在確認待ちの最新版を指定してください。']);
            }
            $confirm = $data['action'] === 'confirm';
            if ($current['source'] === 'received' && CaseTaskSubmission::where('received_document_id', $current['id'])
                ->where(fn ($query) => $query->where('source_type', 'auto_generated')->orWhereNotNull('case_generated_document_id'))->exists()) {
                LegalFinalizationGate::enforce($request->user());
            }
            $authority = RehearsalDocumentAuthority::current();
            $assignment = $authority?->authorizeInternal($request->user(), $case->id, $document->id, $current['source'], $current['id']);
            $reason = $confirm ? null : $data['reason'];
            $detail = $confirm ? null : trim($data['detail'] ?? '');
            if ($current['source'] === 'task_submission') {
                $submission = $document->taskSubmissions()->findOrFail($data['file_id']);
                $workflow = app(CaseTaskWorkflowService::class);
                $confirm ? $workflow->approve($case, $submission->task, $submission, $request)
                    : $workflow->reject($case, $submission->task, $submission, $request, $reason, $detail);
                return;
            }
            $file = $document->receivedDocuments()->whereKey($data['file_id'])->lockForUpdate()->firstOrFail();
            if ($file->review_status === null && $document->activeCaseTask) {
                // Only pre-workflow uploads lack a submission; new uploads always
                // use CaseTaskWorkflowService and its immutable submission record.
                $document->activeCaseTask->update(['status' => $confirm ? 'completed' : 'changes_requested',
                    'completed_at' => $confirm ? now() : null]);
            }
            $file->update([
                'review_status' => $confirm ? 'approved' : 'rejected',
                'reviewed_by' => $request->user()->id, 'reviewed_at' => now(),
                'review_reason' => $reason, 'review_detail' => $detail,
            ]);
            $document->update(['collection_status' => 'received', 'review_status' => $confirm ? 'reviewed' : 'returned',
                'fulfillment_status' => $confirm ? 'satisfied' : 'insufficient']);
            if ($assignment) $authority->recordInternal($request->user(), $assignment, $confirm);
            app(CaseWorkspaceAuditService::class)->record($case, $request,
                $confirm ? '資料を確認済みに変更' : '資料を差し戻し',
                $document->title.($reason ? "\n理由: ".$reason : '').($detail ? "\n".$detail : ''), [
                    'event' => $confirm ? 'document_collection.file_confirmed' : 'document_collection.file_returned',
                    'document_file_event' => true, 'document_id' => $document->id,
                    'actor_user_id' => $request->user()->id, 'received_document_id' => $file->id,
                    'version' => $file->version, 'reason' => $reason, 'detail' => $detail,
                ]);
        });
    }
}
