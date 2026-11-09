<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMessage extends Model
{
    protected $hidden = ['attachments'];

    protected $fillable = [
        'chat_room_id', 'user_id', 'employee_id', 'client_message_id',
        'original_text', 'source_language', 'japanese_content', 'vietnamese_content',
        'translation_status', 'translation_error_category', 'translation_provider',
        'translation_provider_metadata',
        'reply_to_message_id', 'mentions',
    ];

    protected function casts(): array
    {
        return [
            'attachments' => 'array',
            'mentions' => 'array',
            'translation_provider_metadata' => 'array',
            'recalled_at' => 'datetime',
            'pinned_at' => 'datetime',
            'reply_to_message_id' => 'integer',
            'translation_attempt' => 'integer',
        ];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(ChatRoom::class, 'chat_room_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_message_id');
    }

    public function pinnedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pinned_by');
    }
}
