<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendancePeriod extends Model
{
    protected $fillable = [
        'attendance_id',
        'type',
        'started_at',
        'expected_end_at',
        'ended_at',
        'destination',
        'note',
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
}
