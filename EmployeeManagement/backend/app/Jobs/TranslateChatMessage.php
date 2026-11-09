<?php

namespace App\Jobs;

use App\Contracts\ChatTranslationProvider;
use App\Models\ChatMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class TranslateChatMessage implements ShouldQueue
{
    use Queueable;

    public const QUEUE = 'chat-translations';

    public int $tries = 1;

    public int $timeout = 25;

    // A default property also supports jobs already serialized by older releases.
    public int $attempt = 0;

    public function __construct(public readonly int $messageId, int $attempt = 0)
    {
        $this->attempt = $attempt;
    }

    public function handle(ChatTranslationProvider $provider): void
    {
        $message = $this->pending()->first();
        if (! $message) {
            return;
        }
        if (config('chat_translation.provider') !== 'gemini') {
            $this->failTranslation('provider_disabled');

            return;
        }

        try {
            $result = $provider->translate($message->original_text, $message->source_language);
            $target = $message->source_language === 'ja' ? 'vietnamese_content' : 'japanese_content';
            if ($result['status'] !== 'completed' || trim((string) $result[$target]) === '') {
                $this->failTranslation('translation_unavailable');

                return;
            }
        } catch (Throwable) {
            $this->failTranslation('translation_unavailable');

            return;
        }

        $this->pending()->update([$target => $result[$target], 'translation_status' => 'completed']);
    }

    public function failed(?Throwable $error): void
    {
        $this->failTranslation('worker_failed');
    }

    private function pending(): \Illuminate\Database\Eloquent\Builder
    {
        return ChatMessage::query()->whereKey($this->messageId)
            ->when(Schema::hasTable('chat_message_actions'), fn ($query) => $query->whereNull('recalled_at'))
            ->when(Schema::hasTable('chat_message_user_states'), fn ($query) => $query->where('translation_attempt', $this->attempt))
            ->where('translation_provider', 'gemini')->where('translation_status', 'pending');
    }

    private function failTranslation(string $category): void
    {
        $this->pending()->update(['translation_status' => 'failed', 'translation_error_category' => $category]);
    }
}
