<?php

namespace App\Models;

use App\Services\TaskVisibility;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseTask extends Model
{
    use SoftDeletes;

    public const ACTIVE_STATUSES = ['unaccepted', 'in_progress', 'pending_review', 'changes_requested'];

    public const STATUSES = ['unaccepted', 'in_progress', 'pending_review', 'changes_requested', 'completed', 'cancelled'];

    public const FINAL_STATUSES = ['completed', 'cancelled'];

    public const PRIORITIES = ['low', 'normal', 'high', 'critical'];

    protected $fillable = [
        'case_file_id', 'case_document_id', 'assigned_employee_id', 'created_by_employee_id',
        'title', 'description', 'status', 'priority', 'due_at', 'accepted_at', 'completed_at',
    ];

    protected $appends = ['status_label', 'is_overdue', 'allowed_actions'];

    protected function casts(): array
    {
        return ['due_at' => 'datetime', 'accepted_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    /** Case permissions remain a prerequisite; assignment permission is not view-all. */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        if (! $user || ! $user->hasPermission('case.view')) {
            return $query->whereRaw('1 = 0');
        }

        $query->whereHas('caseFile', fn ($case) => $case->visibleTo($user));
        if (\App\Services\CaseAccessService::rehearsal()) {
            $query->where(fn ($task) => $task->whereNull($task->qualifyColumn('case_document_id'))
                ->orWhereHas('caseDocument', fn ($document) => $document
                    ->whereColumn('case_documents.case_file_id', $query->qualifyColumn('case_file_id'))));
        }

        return TaskVisibility::scopeAssignment($query, $user, 'assigned_employee_id');
    }

    public function isVisibleTo(?User $user): bool
    {
        return static::query()->visibleTo($user)->whereKey($this->id)->exists();
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function assignedEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'assigned_employee_id');
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }

    public function caseDocument(): BelongsTo
    {
        return $this->belongsTo(CaseDocument::class);
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(CaseTaskSubmission::class)->orderByDesc('version');
    }

    public function latestSubmission(): HasOne
    {
        return $this->hasOne(CaseTaskSubmission::class)->latestOfMany('version');
    }

    public function approvedSubmission(): HasOne
    {
        return $this->hasOne(CaseTaskSubmission::class)
            ->ofMany(['version' => 'max'], fn ($query) => $query->where('review_status', 'approved'));
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'unaccepted' => '未受領',
            'in_progress' => '対応中',
            'pending_review' => '確認待ち',
            'changes_requested' => '差戻し',
            'completed' => '完了',
            'cancelled' => 'キャンセル',
            default => $this->status,
        };
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->due_at !== null
            && ! in_array($this->status, self::FINAL_STATUSES, true)
            && $this->due_at->isPast();
    }

    /** @return array<string, bool> */
    public function allowedActionsFor(?User $user, ?array $grants = null): array
    {
        $has = fn (string $permission) => $grants !== null ? ($grants[$permission] ?? false) : ($user?->hasPermission($permission) ?? false);
        $access = \App\Services\CaseAccessService::rehearsal();
        $write = \App\Services\CaseAccessService::presentationWrite($user, $this->case_file_id);
        $isAssignee = $user?->employee_id !== null && (int) $user->employee_id === (int) $this->assigned_employee_id;
        $canWork = $write && $isAssignee && $has('task.update');
        $canManage = $write && $has('task.manage');
        $canReview = $write && $has('case.view') && $has('task.review');
        if (\App\Services\LegalFinalizationGate::policyPending()) {
            $canReview = $canReview && $this->relationLoaded('latestSubmission')
                && $this->latestSubmission?->source_type === 'manual_upload'
                && $this->latestSubmission->case_generated_document_id === null;
        }
        if ($access) $canReview = $canReview && $this->relationLoaded('latestSubmission')
            && $this->latestSubmission?->source_type === 'manual_upload'
            && $this->latestSubmission->case_generated_document_id === null;
        if ($authority = \App\Services\RehearsalDocumentAuthority::current()) {
            $canReview = $canReview && $authority->canInternal($user, $this->case_file_id, $this->case_document_id,
                'task_submission', $this->latestSubmission->id);
        }

        // Optional explanation only for blocked legal decisions. Ordinary task responses stay unchanged.
        $legalPending = \App\Services\LegalFinalizationGate::policyPending() && $this->status === 'pending_review'
            && $this->relationLoaded('latestSubmission') && $this->latestSubmission
            && ($this->latestSubmission->source_type === 'auto_generated' || $this->latestSubmission->case_generated_document_id !== null);
        return [
            ...($legalPending ? ['legal_approval_pending' => true] : []),
            'can_accept' => $canWork && $this->status === 'unaccepted',
            'can_submit' => $canWork && in_array($this->status, ['in_progress', 'changes_requested'], true),
            'can_reassign' => $canManage && ! in_array($this->status, self::FINAL_STATUSES, true),
            'can_change_deadline' => $canManage && ! in_array($this->status, self::FINAL_STATUSES, true),
            'can_approve' => $canReview && $this->status === 'pending_review',
            'can_reject' => $canReview && $this->status === 'pending_review',
            'can_cancel' => $canManage && ! in_array($this->status, self::FINAL_STATUSES, true),
        ];
    }

    public function getAllowedActionsAttribute(): array
    {
        return $this->allowedActionsFor(auth()->user());
    }
}
