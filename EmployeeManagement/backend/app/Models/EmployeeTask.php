<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeTask extends Model
{
    protected $fillable = [
        'employee_id',
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

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function workSession(): BelongsTo
    {
        return $this->belongsTo(WorkSession::class);
    }
}
