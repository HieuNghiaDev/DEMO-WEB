<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CaseActivity extends Model
{
    protected $fillable = ['case_file_id', 'created_by_employee_id', 'activity_type', 'channel', 'title', 'content', 'occurred_at', 'metadata'];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime', 'metadata' => 'array'];
    }

    public function attributesToArray()
    {
        $attributes = parent::attributesToArray();
        // The history API exposes only the safe file descriptor and its scoped download action.
        unset($attributes['metadata']['history_attachments']);

        return $attributes;
    }

    /** Keep audit records stored; restrict only their exposure in case responses. */
    public function scopeVisibleTaskData(Builder $query, ?User $user): Builder
    {
        if ($user?->hasPermission('task.view_all') && $user->hasPermission('case.view')) return $query;

        $caseTasks = CaseTask::withTrashed()->visibleTo($user)->select('id');
        $employeeTasks = EmployeeTask::query()->visibleTo($user)->select('id');
        $documents = CaseDocument::query()->withVisibleTaskMetadata($user)->select('id');
        return $query->where(function (Builder $q) use ($caseTasks, $employeeTasks, $documents, $user): void {
            $q->where(function (Builder $ordinary) use ($documents): void {
                $ordinary->whereNull('metadata->task_id')->whereNull('metadata->assigned_task_id')
                    ->whereNull('metadata->employee_task_id')
                    ->where(fn (Builder $event) => $event->whereNull('metadata->event')->orWhere('metadata->event', 'not like', 'task.%'))
                    ->where(fn (Builder $changes) => $changes
                        ->where(fn (Builder $public) => $public->whereNull('metadata->changes->assigned_employee_id')->whereNull('metadata->changes->response_deadline'))
                        ->orWhereIn('metadata->document_id', $documents));
            })->orWhereIn('metadata->task_id', $caseTasks)
                ->orWhereIn('metadata->assigned_task_id', $employeeTasks)
                ->orWhereIn('metadata->employee_task_id', $employeeTasks);
            if ($user?->hasPermission('case.view')) {
                $q->orWhere('metadata->document_file_event', true);
            }
        });
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }
}
