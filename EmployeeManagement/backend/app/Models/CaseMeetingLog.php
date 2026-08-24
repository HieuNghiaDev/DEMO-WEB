<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CaseMeetingLog extends Model
{
    protected $fillable = ['case_file_id', 'meeting_date', 'interaction_type', 'attendees', 'content', 'next_action', 'next_action_due_at', 'status', 'created_by_employee_id', 'created_by_ai_name', 'confirmed_by_employee_id', 'confirmed_at'];

    protected function casts(): array
    {
        return ['meeting_date' => 'date', 'next_action_due_at' => 'datetime', 'confirmed_at' => 'datetime'];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }

    public function confirmedByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'confirmed_by_employee_id');
    }
}
