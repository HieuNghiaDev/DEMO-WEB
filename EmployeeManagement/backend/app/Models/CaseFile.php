<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseFile extends Model
{
    use SoftDeletes;

    protected $fillable = ['title', 'case_type', 'case_type_id', 'case_type_other', 'client_id', 'department_id', 'assigned_employee_id', 'created_by_employee_id', 'status'];

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
}
