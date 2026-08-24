<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalRequest extends Model
{
    protected $fillable = [
        'action_type',
        'tool_name',
        'payload',
        'requested_by',
        'status',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'executed_by',
        'executed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'executed_at' => 'datetime',
        ];
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function executedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'executed_by');
    }
}
