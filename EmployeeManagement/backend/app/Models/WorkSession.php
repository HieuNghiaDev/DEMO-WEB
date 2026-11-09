<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class WorkSession extends Model
{
    protected $fillable = [
        'attendance_id',
        'task_description',
        'started_at',
        'expected_end_at',
        'ended_at',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'expected_end_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function attendance(): BelongsTo
    {
        return $this->belongsTo(Attendance::class);
    }

    public function employeeTask(): HasOne
    {
        return $this->hasOne(EmployeeTask::class);
    }

    public function taskDataVisibleTo(?User $user, ?int $employeeId): bool
    {
        if (! \App\Services\TaskVisibility::canViewAssignee($user, $employeeId)) return false;
        $task = $this->employeeTask;
        $this->makeHidden('employeeTask');
        return $task === null || $task->isVisibleTo($user);
    }
}
