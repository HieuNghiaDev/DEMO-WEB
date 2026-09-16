<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientEmployment extends Model
{
    public const STATUSES = ['employed', 'leave', 'former', 'unknown'];

    protected $fillable = [
        'company_name', 'company_address', 'company_phone', 'employment_status',
        'start_date', 'end_date', 'is_current', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'is_current' => 'boolean',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
