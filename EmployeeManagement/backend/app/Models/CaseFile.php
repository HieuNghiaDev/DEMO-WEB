<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseFile extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'title', 'reference_number', 'case_type', 'case_type_id', 'case_type_other', 'client_id',
        'department_id', 'assigned_employee_id', 'created_by_employee_id', 'status', 'priority',
        'summary', 'opened_at', 'target_completion_at',
    ];

    protected function casts(): array
    {
        return ['opened_at' => 'date', 'target_completion_at' => 'date'];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function caseTypeOption(): BelongsTo
    {
        return $this->belongsTo(CaseType::class);
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
        return $this->hasMany(CaseTask::class)->orderByRaw("status = 'completed'")->orderBy('due_at');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(CaseActivity::class)->latest('occurred_at');
    }
}
