<?php

namespace App\Services;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\GeneratedDocumentArtifact;
use App\Models\User;
use App\Models\ReceivedDocument;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class CaseTaskWorkflowService
{
    public function __construct(
        private readonly CaseWorkspaceAuditService $audit,
        private readonly GoogleDriveService $drive,
        private readonly GoogleDriveProvisioningService $folders,
    ) {}

    public function accept(CaseFile $caseFile, CaseTask $task, Request $request): CaseTask
    {
        return DB::transaction(function () use ($caseFile, $task, $request): CaseTask {
            $task = $this->lockedTask($caseFile, $task, $request->user());
            $this->assertAssignee($task, $request->user(), 'このタスクを受領する権限がありません。');
            if ($task->status !== 'unaccepted') {
                throw ValidationException::withMessages(['status' => '未受領のタスクのみ受領できます。']);
            }
            $task->update(['status' => 'in_progress', 'accepted_at' => now()]);
            $this->audit->record($caseFile, $request, 'タスクを受領', $task->title, [
                'event' => 'task.accepted', 'task_id' => $task->id, 'case_document_id' => $task->case_document_id,
            ]);

            return $this->loadTask($task->fresh());
        });
    }

    /** @param array{assigned_employee_id?: int, due_at?: mixed, priority?: string, description?: ?string} $data */
    public function manage(CaseFile $caseFile, CaseTask $task, Request $request, array $data): CaseTask
    {
        $this->assertPermission($request->user(), 'task.manage');

        return DB::transaction(function () use ($caseFile, $task, $request, $data): CaseTask {
            $task = $this->lockedTask($caseFile, $task, $request->user());
            $this->assertNotFinal($task);
            $before = $task->only(['assigned_employee_id', 'due_at', 'priority', 'description']);
            if (array_key_exists('assigned_employee_id', $data)) {
                $employee = Employee::query()->whereKey($data['assigned_employee_id'])->where('status', 'active')->first();
                if (! $employee) {
                    throw ValidationException::withMessages(['assigned_employee_id' => '在籍中の社員を選択してください。']);
                }
            }
            $task->fill($data);
            $changes = $task->getDirty();
            $task->save();
            if ($changes !== []) {
                $this->audit->record($caseFile, $request, 'タスクの管理情報を更新', $task->title, [
                    'event' => array_key_exists('assigned_employee_id', $changes) ? 'task.reassigned' : 'task.management_updated',
                    'task_id' => $task->id,
                    'before' => $before,
                    'after' => $task->only(['assigned_employee_id', 'due_at', 'priority', 'description']),
                ]);
                if (array_key_exists('assigned_employee_id', $changes)) {
                    $this->notifyEmployee($task->assigned_employee_id, '新しいタスクが割り当てられました', $task->title, $task);
                } elseif (array_intersect(['due_at', 'priority', 'description'], array_keys($changes)) !== []) {
                    $this->notifyEmployee($task->assigned_employee_id, 'タスクの内容が更新されました', $task->title, $task);
                }
            }

            return $this->loadTask($task->fresh());
        });
    }

    public function cancel(CaseFile $caseFile, CaseTask $task, Request $request): CaseTask
    {
        $this->assertPermission($request->user(), 'task.manage');

        return DB::transaction(function () use ($caseFile, $task, $request): CaseTask {
            $task = $this->lockedTask($caseFile, $task, $request->user());
            $this->assertNotFinal($task);
            $task->update(['status' => 'cancelled', 'completed_at' => null]);
            $this->audit->record($caseFile, $request, 'タスクをキャンセル', $task->title, [
                'event' => 'task.cancelled', 'task_id' => $task->id,
            ]);

            return $this->loadTask($task->fresh());
        });
    }

    public function submitUpload(CaseFile $caseFile, CaseTask $task, UploadedFile $file, Request $request): CaseTaskSubmission
    {
        $lock = Cache::lock('case-task-submission:'.$task->case_document_id, 120);

        return $lock->block(5, function () use ($caseFile, $task, $file, $request): CaseTaskSubmission {
            $context = DB::transaction(function () use ($caseFile, $task, $request): array {
                $task = $this->lockedTask($caseFile, $task, $request->user());
                $this->assertSubmitAllowed($task, $request->user());
                $document = CaseDocument::query()->whereKey($task->case_document_id)->lockForUpdate()->firstOrFail();

                return ['task' => $task, 'document' => $document, 'version' => $this->nextVersion($document)];
            });

            $bytes = $file->get();
            if (! is_string($bytes)) {
                throw ValidationException::withMessages(['file' => '提出ファイルを読み込めませんでした。']);
            }
            $mime = $file->getMimeType() ?: 'application/octet-stream';
            $filename = $this->submissionFilename($caseFile, $context['document'], $context['version'], $file->getClientOriginalName());
            $folder = $this->folders->provisionGeneratedDocuments($caseFile);
            $key = hash('sha256', config('app.key').'|task-submission|'.$context['document']->id.'|'.$context['version'].'|'.hash('sha256', $bytes));
            $remote = $this->drive->storeTaskSubmission($bytes, $filename, $mime, $folder->external_folder_id, $key);

            try {
                return DB::transaction(function () use ($caseFile, $context, $request, $remote): CaseTaskSubmission {
                    $task = $this->lockedTask($caseFile, $context['task'], $request->user());
                    $this->assertSubmitAllowed($task, $request->user());
                    $document = CaseDocument::query()->whereKey($context['document']->id)->lockForUpdate()->firstOrFail();
                    if ($this->nextVersion($document) !== $context['version']) {
                        throw ValidationException::withMessages(['file' => '新しい版が登録されたため、もう一度提出してください。']);
                    }
                    $submission = $this->createSubmission($task, $document, $request->user(), $context['version'], 'manual_upload', $remote);
                    $this->markSubmitted($caseFile, $task, $document, $submission, $request);

                    return $submission->fresh(['submittedBy:id,name', 'reviewedBy:id,name']);
                });
            } catch (Throwable $error) {
                if (! $this->drive->deleteFile($remote['external_file_id'])) {
                    Log::error('Task submission upload requires manual Drive cleanup.', [
                        'case_task_id' => $context['task']->id,
                        'external_file_id' => $remote['external_file_id'],
                        'recovery_key' => $key,
                    ]);
                }
                if ($error instanceof ValidationException) {
                    throw $error;
                }
                throw new GeneratedDocumentDriveException('Driveへの保存後、提出記録の保存に失敗しました。管理者に確認してください。');
            }
        });
    }

    public function submitGenerated(
        CaseFile $caseFile,
        CaseTask $task,
        CaseGeneratedDocument $generated,
        GeneratedDocumentArtifact $artifact,
        Request $request,
    ): CaseTaskSubmission {
        return DB::transaction(function () use ($caseFile, $task, $generated, $artifact, $request): CaseTaskSubmission {
            $task = $this->lockedTask($caseFile, $task, $request->user());
            $this->assertSubmitAllowed($task, $request->user());
            $document = CaseDocument::query()->whereKey($task->case_document_id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $generated->case_document_id === $document->id, 422, '生成文書とタスクが一致しません。');
            $existing = CaseTaskSubmission::query()->where('case_generated_document_id', $generated->id)->first();
            if ($existing) {
                return $existing->load(['submittedBy:id,name', 'reviewedBy:id,name']);
            }
            $version = (int) $generated->version;
            if (CaseTaskSubmission::query()->where('case_document_id', $document->id)->where('version', $version)->exists()) {
                throw ValidationException::withMessages(['version' => '同じ版の提出記録がすでに存在します。']);
            }
            $submission = $this->createSubmission($task, $document, $request->user(), $version, 'auto_generated', [
                'external_file_id' => $artifact->external_file_id,
                'external_url' => $artifact->external_url,
                'filename' => $artifact->filename,
                'mime_type' => $artifact->mime_type,
                'checksum' => $artifact->checksum,
            ], $generated->id);
            $this->markSubmitted($caseFile, $task, $document, $submission, $request);

            return $submission->fresh(['submittedBy:id,name', 'reviewedBy:id,name']);
        });
    }

    public function approve(CaseFile $caseFile, CaseTask $task, CaseTaskSubmission $submission, Request $request): CaseTask
    {
        $this->assertPermission($request->user(), 'task.review');

        return $this->review($caseFile, $task, $submission, $request, true, null);
    }

    public function reject(CaseFile $caseFile, CaseTask $task, CaseTaskSubmission $submission, Request $request, string $reason, ?string $detail = null): CaseTask
    {
        $this->assertPermission($request->user(), 'task.review');

        return $this->review($caseFile, $task, $submission, $request, false, trim($reason), $detail);
    }

    /** Register the existing local/link upload as the task's immutable submission. */
    public function submitReceived(CaseFile $case, CaseDocument $document, ReceivedDocument $file, Request $request, string $mime): bool
    {
        $task = $document->activeCaseTask ?? $document->latestCaseTask;
        if (! $task || $task->trashed() || ! in_array($task->status, ['in_progress', 'changes_requested', 'completed'], true)) {
            return false;
        }
        $task = $this->lockedTask($case, $task, $request->user());
        $submission = CaseTaskSubmission::create([
            'case_task_id' => $task->id, 'case_document_id' => $document->id,
            'received_document_id' => $file->id, 'version' => $file->version,
            'source_type' => 'manual_upload', 'review_status' => 'pending_review',
            'storage_provider' => $file->storage_type, 'external_file_id' => 'received:'.$file->id,
            'external_url' => $file->external_url ?? '', 'filename' => $file->original_filename ?: $file->title,
            'mime_type' => $mime, 'submitted_by' => $request->user()->id, 'submitted_at' => now(),
        ]);
        $this->markSubmitted($case, $task, $document, $submission, $request);
        return true;
    }

    public function assertSubmitAllowed(CaseTask $task, ?User $user): void
    {
        $this->assertAssignee($task, $user, 'このタスクの提出を行う権限がありません。');
        if (! in_array($task->status, ['in_progress', 'changes_requested'], true)) {
            throw ValidationException::withMessages(['status' => '現在の状態ではファイルを提出できません。']);
        }
    }

    private function review(
        CaseFile $caseFile,
        CaseTask $task,
        CaseTaskSubmission $submission,
        Request $request,
        bool $approve,
        ?string $reason,
        ?string $detail = null,
    ): CaseTask {
        return DB::transaction(function () use ($caseFile, $task, $submission, $request, $approve, $reason, $detail): CaseTask {
            abort_unless($caseFile->isVisibleTo($request->user()), 403);
            $this->assertPermission($request->user(), 'task.review');
            $task = $this->lockedTask($caseFile, $task, $request->user());
            if ($task->status !== 'pending_review') {
                throw ValidationException::withMessages(['status' => 'このタスクはすでに確認済みです。']);
            }
            $submission = CaseTaskSubmission::query()->whereKey($submission->id)->lockForUpdate()->firstOrFail();
            abort_if(CaseAccessService::rehearsal()
                && ($submission->source_type === 'auto_generated' || $submission->case_generated_document_id !== null), 409,
                'Independent legal authority mapping is required for this rehearsal.');
            abort_unless($submission->case_task_id === $task->id
                && $submission->case_document_id === $task->case_document_id, 404);
            if ($submission->source_type === 'auto_generated' || $submission->case_generated_document_id !== null) {
                LegalFinalizationGate::enforce($request->user());
            }
            $latest = CaseTaskSubmission::query()->where('case_task_id', $task->id)->orderByDesc('version')->lockForUpdate()->first();
            if (! $latest || $latest->id !== $submission->id || $submission->review_status !== 'pending_review') {
                throw ValidationException::withMessages(['submission' => '現在確認待ちの版を指定してください。']);
            }
            $document = CaseDocument::query()->whereKey($submission->case_document_id)
                ->where('case_file_id', $caseFile->id)->lockForUpdate()->firstOrFail();
            $authority = RehearsalDocumentAuthority::current();
            $assignment = $authority?->authorizeInternal($request->user(), $caseFile->id, $document->id, 'task_submission', $submission->id);
            if ($submission->source_type === 'manual_upload') {
                $current = app(RequiredDocumentFileReview::class)->current($document);
                if (! $current || $current['source'] !== 'task_submission' || $current['id'] !== $submission->id) {
                    throw ValidationException::withMessages(['submission' => '現在確認待ちの最新版を指定してください。']);
                }
            }
            $submission->update([
                'review_status' => $approve ? 'approved' : 'rejected',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'review_note' => $approve ? null : trim($reason.($detail ? "\n".$detail : '')),
                'review_reason' => $approve ? null : $reason,
                'review_detail' => $approve ? null : $detail,
            ]);
            if ($submission->received_document_id) {
                $document->receivedDocuments()->whereKey($submission->received_document_id)->lockForUpdate()->firstOrFail()->update([
                    'review_status' => $approve ? 'approved' : 'rejected',
                    'reviewed_by' => $request->user()->id, 'reviewed_at' => now(),
                    'review_reason' => $approve ? null : $reason, 'review_detail' => $approve ? null : $detail,
                ]);
            }
            $task->update([
                'status' => $approve ? 'completed' : 'changes_requested',
                'completed_at' => $approve ? now() : null,
            ]);
            $document->update([
                'collection_status' => 'received',
                'fulfillment_status' => $approve ? 'satisfied' : 'insufficient',
                'review_status' => $approve ? 'reviewed' : 'returned',
            ]);
            if ($submission->case_generated_document_id) {
                $generated = CaseGeneratedDocument::query()->whereKey($submission->case_generated_document_id)
                    ->where('case_document_id', $document->id)->lockForUpdate()->firstOrFail();
                if ($approve) {
                    $generated->update([
                        'workflow_status' => 'approved',
                        'approved_data' => $generated->draft_data,
                        'approved_at' => now(),
                        'approved_by' => $request->user()->id,
                        'updated_by' => $request->user()->id,
                    ]);
                } else {
                    $generated->update([
                        'workflow_status' => 'draft',
                        'updated_by' => $request->user()->id,
                    ]);
                }
            }
            $event = $approve ? 'task.submission_approved' : 'task.submission_rejected';
            if ($assignment) $authority->recordInternal($request->user(), $assignment, $approve);
            $manual = $submission->source_type === 'manual_upload';
            $this->audit->record($caseFile, $request,
                $manual ? ($approve ? '資料を確認済みに変更' : '資料を差し戻し') : ($approve ? '提出物を承認' : '提出物を差戻し'),
                $document->title.($reason ? "\n理由: ".$reason : '').($detail ? "\n".$detail : ''), [
                'event' => $event,
                'task_id' => $task->id,
                'case_document_id' => $document->id,
                'document_id' => $document->id,
                'document_file_event' => true,
                'actor_user_id' => $request->user()->id,
                'submission_id' => $submission->id,
                'version' => $submission->version,
                'reason' => $reason,
                'detail' => $detail,
            ]);
            $this->notifyEmployee(
                $task->assigned_employee_id,
                $approve ? '提出物が承認されました' : '提出物が差し戻されました',
                $approve ? $task->title : $task->title.'：'.$reason,
                $task,
            );

            return $this->loadTask($task->fresh());
        });
    }

    private function markSubmitted(
        CaseFile $caseFile,
        CaseTask $task,
        CaseDocument $document,
        CaseTaskSubmission $submission,
        Request $request,
    ): void {
        $task->update(['status' => 'pending_review', 'completed_at' => null]);
        $document->update([
            'collection_status' => 'received',
            'review_status' => 'reviewing',
            // A corrected manual file must be checked anew, not retain the
            // previous version's insufficient/satisfied assessment.
            ...($submission->source_type === 'manual_upload' ? ['fulfillment_status' => 'undetermined'] : []),
        ]);
        $this->audit->record($caseFile, $request, 'ファイル v'.$submission->version.' をアップロード', $submission->filename, [
            'event' => 'task.submission_created',
            'task_id' => $task->id,
            'case_document_id' => $document->id,
            'document_id' => $document->id,
            'document_file_event' => true,
            'actor_user_id' => $request->user()->id,
            'submission_id' => $submission->id,
            'version' => $submission->version,
            'source_type' => $submission->source_type,
        ]);
        $this->notifyReviewers($task, $submission);
    }

    private function createSubmission(
        CaseTask $task,
        CaseDocument $document,
        User $actor,
        int $version,
        string $sourceType,
        array $remote,
        ?int $generatedDocumentId = null,
    ): CaseTaskSubmission {
        return CaseTaskSubmission::query()->create([
            'case_task_id' => $task->id,
            'case_document_id' => $document->id,
            'case_generated_document_id' => $generatedDocumentId,
            'version' => $version,
            'source_type' => $sourceType,
            'review_status' => 'pending_review',
            'storage_provider' => 'google_drive',
            'external_file_id' => $remote['external_file_id'],
            'external_url' => $remote['external_url'],
            'filename' => $remote['filename'],
            'mime_type' => $remote['mime_type'],
            'checksum' => $remote['checksum'] ?? null,
            'submitted_by' => $actor->id,
            'submitted_at' => now(),
        ]);
    }

    public function nextVersion(CaseDocument $document): int
    {
        $submissionVersion = (int) $document->taskSubmissions()->max('version');
        $generatedVersion = (int) $document->generatedDocuments()->max('version');

        $receivedVersion = (int) $document->receivedDocuments()->withTrashed()->max('version');

        return max($submissionVersion, $generatedVersion, $receivedVersion) + 1;
    }

    private function lockedTask(CaseFile $caseFile, CaseTask $task, ?User $actor): CaseTask
    {
        CaseAccessService::rehearsal()?->authorizeWrite($actor, $caseFile->id);
        // All document/file writers serialize on the case before task/document locks.
        CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
        return CaseTask::query()->whereKey($task->id)->where('case_file_id', $caseFile->id)->lockForUpdate()->firstOrFail();
    }

    private function assertAssignee(CaseTask $task, ?User $user, string $message): void
    {
        abort_unless($user?->employee_id !== null
            && (int) $user->employee_id === (int) $task->assigned_employee_id
            && $user->hasPermission('task.update'), 403, $message);
    }

    private function assertPermission(?User $user, string $permission): void
    {
        abort_unless($user?->hasPermission($permission), 403, 'このタスクを管理する権限がありません。');
    }

    private function assertNotFinal(CaseTask $task): void
    {
        if (in_array($task->status, CaseTask::FINAL_STATUSES, true)) {
            throw ValidationException::withMessages(['status' => '完了またはキャンセル済みのタスクは変更できません。']);
        }
    }

    private function submissionFilename(CaseFile $caseFile, CaseDocument $document, int $version, string $original): string
    {
        $safe = Str::of($original)->replaceMatches('~[\\/:*?"<>|\x00-\x1F]+~u', '-')
            ->squish()->trim(' .-')->limit(100, '');

        return 'CASE-'.$caseFile->id.'_DOC-'.$document->id.'_v'.$version.'_'.($safe ?: 'submission');
    }

    private function loadTask(CaseTask $task): CaseTask
    {
        return $task->load([
            'assignedEmployee:id,full_name,avatar_path',
            'caseDocument.documentType:id,code,name_ja,handling_type',
            'latestSubmission.submittedBy:id,name',
            'latestSubmission.reviewedBy:id,name',
            'submissions.submittedBy:id,name',
            'submissions.reviewedBy:id,name',
        ]);
    }

    private function notifyEmployee(?int $employeeId, string $title, string $message, CaseTask $task): void
    {
        $user = $employeeId ? Employee::query()->with('user')->find($employeeId)?->user : null;
        if (! $user || ! $user->is_active || ! $task->isVisibleTo($user)
            || ($user->employee_id !== null && $user->employee?->status !== 'active')) {
            return;
        }
        EmployeeNotification::query()->create([
            'user_id' => $user->id,
            'kind' => 'info',
            'title' => $title,
            'message' => $message,
            'data' => ['case_task_id' => $task->id, 'target_path' => "/quests/{$task->case_file_id}"],
        ]);
    }

    private function notifyReviewers(CaseTask $task, CaseTaskSubmission $submission): void
    {
        User::query()->whereHas('roles.permissions', fn ($query) => $query->where('name', 'task.review'))
            ->where('is_active', true)->get()->each(function (User $user) use ($task, $submission): void {
                if (! $task->caseFile?->isVisibleTo($user)
                    || ($user->employee_id !== null && $user->employee?->status !== 'active')) {
                    return;
                }
                if (RehearsalDocumentAuthority::current() && ! RehearsalDocumentAuthority::current()->canInternal(
                    $user, $task->case_file_id, $task->case_document_id, 'task_submission', $submission->id)) return;
                $visibleTask = $task->isVisibleTo($user);
                EmployeeNotification::query()->create([
                    'user_id' => $user->id,
                    'kind' => 'info',
                    'title' => 'タスクの提出物が確認待ちです',
                    'message' => ($visibleTask ? $task->title : $task->caseDocument?->title).' v'.$submission->version,
                    'data' => [
                        ...($visibleTask ? ['case_task_id' => $task->id, 'submission_id' => $submission->id]
                            : ['case_document_id' => $task->case_document_id]),
                        'target_path' => "/quests/{$task->case_file_id}",
                    ],
                ]);
            });
    }
}
