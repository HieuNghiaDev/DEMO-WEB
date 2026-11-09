<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseFile extends Model
{
    use SoftDeletes;

    // Proposed classification is not exposed or writable through the existing API contract.
    protected $hidden = ['is_confidential'];

    protected $fillable = [
        'title', 'reference_number', 'case_type', 'case_type_id', 'case_type_other', 'client_id',
        'department_id', 'assigned_employee_id', 'created_by_employee_id', 'status', 'priority',
        'summary', 'opened_at', 'target_completion_at',
        'incident_summary', 'occurred_at', 'injury_details', 'incident_location', 'current_status_memo',
    ];

    protected function casts(): array
    {
        return ['opened_at' => 'date', 'target_completion_at' => 'date', 'occurred_at' => 'datetime', 'is_confidential' => 'boolean'];
    }

    /** Runtime confidential content scope; explicit RAM rehearsal additionally restricts normal cases. */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        return \App\Services\CaseAccessService::contentScope($query, $user);
    }

    public function isVisibleTo(?User $user): bool
    {
        return static::query()->visibleTo($user)->whereKey($this->getKey())->exists();
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function caseMemberships(): HasMany
    {
        return $this->hasMany(CaseMembership::class);
    }

    public function caseTypeOption(): BelongsTo
    {
        return $this->belongsTo(CaseType::class, 'case_type_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function assignedEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'assigned_employee_id');
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CaseDocument::class);
    }

    public function receivedDocuments(): HasMany
    {
        return $this->hasMany(ReceivedDocument::class);
    }

    public function precedents(): HasMany
    {
        return $this->hasMany(CasePrecedent::class);
    }

    public function meetingLogs(): HasMany
    {
        return $this->hasMany(CaseMeetingLog::class);
    }

    public function customSections(): HasMany
    {
        return $this->hasMany(CaseCustomSection::class)->orderBy('sort_order');
    }

    public function parties(): HasMany
    {
        return $this->hasMany(CaseParty::class)->latest();
    }

    public function deadlines(): HasMany
    {
        return $this->hasMany(CaseDeadline::class)->orderBy('due_at');
    }

    public function caseTasks(): HasMany
    {
        return $this->hasMany(CaseTask::class)
            ->orderByRaw("CASE WHEN status IN ('pending', 'in_progress') THEN 0 ELSE 1 END")
            ->orderBy('due_at');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(CaseActivity::class)->latest('occurred_at');
    }
}
