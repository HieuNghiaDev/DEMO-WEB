<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Attendance extends Model
{
    protected $fillable = [
        'employee_id',
        'employee_name',
        'work_date',
        'clock_in',
        'break_start',
        'break_end',
        'outside_destination',
        'outside_start',
        'outside_expected_end',
        'outside_end',
        'clock_out',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'clock_in' => 'datetime',
            'break_start' => 'datetime',
            'break_end' => 'datetime',
            'outside_start' => 'datetime',
            'outside_expected_end' => 'datetime',
            'outside_end' => 'datetime',
            'clock_out' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function workSessions(): HasMany
    {
        return $this->hasMany(WorkSession::class);
    }

    public function activeWorkSession(): HasOne
    {
        return $this->hasOne(WorkSession::class)
            ->where('status', 'active')
            ->latestOfMany();
    }
}
