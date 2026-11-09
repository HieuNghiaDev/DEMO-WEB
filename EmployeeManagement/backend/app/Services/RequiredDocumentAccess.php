<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\User;

/** Case-visible progress is not authorization to operate on another employee's work. */
class RequiredDocumentAccess
{
    public function capabilities(CaseDocument $document, ?User $user, ?array $grants = null): array
    {
        $has = fn (string $permission) => $grants !== null ? ($grants[$permission] ?? false) : ($user?->hasPermission($permission) ?? false);
        $task = $document->activeCaseTask ?? $document->latestCaseTask;
        if ($task?->trashed()) $task = null;
        $assignee = $task?->assigned_employee_id ?? $document->assigned_employee_id;
        $assigned = $user?->employee_id !== null && (int) $user->employee_id === (int) $assignee;
        $view = $has('case.view');
        $manage = $view && $has('task.manage');
        // Pre-task collection planning retains its existing case.update grant.
        $edit = $view && $has('case.update') && (! $task || $manage || $assigned);
        $upload = $task
            ? $assigned && $has('task.update')
                && in_array($task->status, ['in_progress', 'changes_requested', 'completed'], true)
            : (($assigned && $has('task.update')) || ($manage && $edit));
        if ($grants['main_role'] ?? \App\Services\Administration\MainRoles::assigned($user)) {
            $edit = $edit && $has('document.update');
            $upload = $upload && $has('document.create');
        }
        // task.review is the existing explicit RBAC grant, including self-review for reviewers.
        $review = $view && $has('task.review')
            && $document->review_status === 'reviewing';

        $capabilities = [
            'can_upload' => $view && $upload,
            'can_change_assignee' => $manage,
            'can_change_deadline' => $manage,
            'can_review' => $review,
            'can_return' => $review,
            'can_edit' => $edit,
        ];
        if (! CaseAccessService::presentationWrite($user, $document->case_file_id)) return array_fill_keys(array_keys($capabilities), false);
        return $capabilities;
    }
}
