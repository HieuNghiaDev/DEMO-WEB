<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    protected $fillable = [
        'employee_id',
        'employee_name',
        'work_date',
        'clock_in',
        'break_start',
        'break_end',
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
            'clock_out' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}