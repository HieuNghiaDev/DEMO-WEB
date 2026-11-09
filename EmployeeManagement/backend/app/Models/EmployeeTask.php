<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeTask extends Model
{
    protected $fillable = [
        'employee_id',
        'case_document_id',
        'work_session_id',
        'assigned_by',
        'title',
        'description',
        'duration_minutes',
        'status',
        'due_at',
        'accepted_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'duration_minutes' => 'integer',
            'due_at' => 'datetime',
            'accepted_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        $query->where(fn ($case) => $case->whereNull($query->getModel()->qualifyColumn('case_document_id'))
            ->orWhereHas('caseDocument', fn ($document) => $document->withTrashed()
                ->whereHas('caseFile', fn ($access) => $access->visibleTo($user))));
        return \App\Services\TaskVisibility::scopeAssignment($query, $user, 'employee_id');
    }

    public function isVisibleTo(?User $user): bool
    {
        return static::query()->visibleTo($user)->whereKey($this->id)->exists();
    }

    public function caseDocument(): BelongsTo
    {
        return $this->belongsTo(CaseDocument::class);
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function workSession(): BelongsTo
    {
        return $this->belongsTo(WorkSession::class);
    }
}
