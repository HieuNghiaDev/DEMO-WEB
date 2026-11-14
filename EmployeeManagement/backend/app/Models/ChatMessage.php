<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMessage extends Model
{
    public const TRANSLATION_PAIRS = ['ja-vi', 'ja-zh'];

    protected $hidden = ['attachments', 'translation_provider_metadata'];

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

    public function translation(string $pair): ?array
    {
        $stored = $this->translation_provider_metadata['on_demand'][$pair] ?? null;
        if ($stored !== null || $pair !== 'ja-vi' || $this->translation_status !== 'completed' || $this->translation_provider === 'identity') {
            return $stored;
        }

        $language = $this->source_language === 'ja' ? 'vi' : 'ja';
        $text = $language === 'vi' ? $this->vietnamese_content : $this->japanese_content;

        return $text ? ['status' => 'completed', 'language' => $language, 'text' => $text, 'revision' => 0] : null;
    }

    public function storeTranslation(string $pair, array $translation): void
    {
        $metadata = $this->translation_provider_metadata ?? [];
        $metadata['on_demand'][$pair] = $translation;
        $this->translation_provider_metadata = $metadata;
        $this->save();
    }

    public function translationRequestedBy(int $userId, string $pair): bool
    {
        return ($this->translation_provider_metadata['requested_by'][$pair][$userId] ?? false) === true;
    }

    public function markTranslationRequested(int $userId, string $pair): void
    {
        if ($this->translationRequestedBy($userId, $pair)) {
            return;
        }

        $metadata = $this->translation_provider_metadata ?? [];
        $metadata['requested_by'][$pair][$userId] = true;
        $this->translation_provider_metadata = $metadata;
    }

    public function translationsFor(int $userId): object
    {
        $translations = [];
        if ($this->recalled_at === null) {
            foreach (self::TRANSLATION_PAIRS as $pair) {
                if ($this->translationRequestedBy($userId, $pair) && ($translation = $this->translation($pair))) {
                    $translations[$pair] = \Illuminate\Support\Arr::only($translation, ['status', 'language', 'text', 'revision']);
                }
            }
        }

        return (object) $translations;
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
