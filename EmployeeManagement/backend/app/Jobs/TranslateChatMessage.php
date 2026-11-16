<?php

namespace App\Jobs;

use App\Contracts\ChatTranslationProvider;
use App\Models\ChatMessage;
use App\Services\GeminiChatTranslationProvider;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class TranslateChatMessage implements ShouldQueue
{
    use InteractsWithQueue, Queueable;

    public const QUEUE = 'chat-translations';

    // Spread retries over about a day so a daily quota reset can also recover a message.
    private const RETRY_DELAYS = [30, 120, 900, 3600, 14400, 68400];

    public int $timeout = 25;

    // A default property also supports jobs already serialized by older releases.
    public int $attempt = 0;
    public ?string $pair = null;

    public function __construct(public readonly int $messageId, int $attempt = 0, ?string $pair = null)
    {
        $this->attempt = $attempt;
        $this->pair = $pair;
    }

    public function tries(): int
    {
        return count(self::RETRY_DELAYS) + 1;
    }

    public function handle(ChatTranslationProvider $provider): void
    {
        // Old automatic jobs lack an explicit request. Only keep historical manual retries.
        if ($this->attempt === 0) {
            return;
        }
        $message = $this->pending()->first();
        if (! $message || ($this->pair !== null && ! $this->pairIsPending($message))) {
            return;
        }
        if (config('chat_translation.provider') !== 'gemini') {
            $this->failTranslation('provider_disabled');

            return;
        }

        try {
            $result = $this->pair === null
                ? $provider->translate($message->original_text, $message->source_language)
                : app(GeminiChatTranslationProvider::class)->translate($message->original_text, $message->source_language, $this->pair);
        } catch (ConnectionException) {
            $this->retryTranslation('provider_connection_error');

            return;
        } catch (Throwable) {
            $this->failTranslation('translation_unavailable');

            return;
        }

        $category = $result['error_category'] ?? null;
        if (in_array($category, ['provider_rate_limited', 'provider_timeout'], true)) {
            $this->retryTranslation($category, (int) ($result['provider_metadata']['retry_after'] ?? 0));

            return;
        }

        $target = $this->pair !== null ? 'translation_text' : ($message->source_language === 'ja' ? 'vietnamese_content' : 'japanese_content');
        if ($result['status'] !== 'completed' || trim((string) ($result[$target] ?? '')) === '') {
            $this->failTranslation('translation_unavailable');

            return;
        }

        if ($this->pair !== null) {
            $this->updatePair(['status' => 'completed', 'text' => $result[$target], 'language' => $result['translation_language'], 'error_category' => null]);
        } else {
            $this->pending()->update([$target => $result[$target], 'translation_status' => 'completed', 'translation_error_category' => null]);
        }
    }

    public function failed(?Throwable $error): void
    {
        $this->failTranslation('worker_failed');
    }

    private function retryTranslation(string $category, int $retryAfter = 0): void
    {
        $attempt = $this->attempts();
        $delay = self::RETRY_DELAYS[$attempt - 1] ?? null;
        // Jobs queued before rollout still have their original attempt limit in the payload.
        if ($delay === null || $attempt >= ($this->job?->maxTries() ?? $this->tries())) {
            $this->failTranslation($category);

            return;
        }

        if ($this->pair !== null) {
            $this->updatePair(['error_category' => $category]);
        } else {
            $this->pending()->update(['translation_error_category' => $category]);
        }
        $this->release(max($delay, min($retryAfter, 86400)));
    }

    private function pending(): \Illuminate\Database\Eloquent\Builder
    {
        return ChatMessage::query()->whereKey($this->messageId)
            ->when(Schema::hasTable('chat_message_actions'), fn ($query) => $query->whereNull('recalled_at'))
            ->when($this->pair === null, fn ($query) => $query
                ->when(Schema::hasTable('chat_message_user_states'), fn ($query) => $query->where('translation_attempt', $this->attempt))
                ->where('translation_provider', 'gemini')->where('translation_status', 'pending'));
    }

    private function failTranslation(string $category): void
    {
        if ($this->pair !== null) {
            $this->updatePair(['status' => 'failed', 'error_category' => $category]);
        } elseif ($this->attempt > 0) {
            $this->pending()->update(['translation_status' => 'failed', 'translation_error_category' => $category]);
        }
    }

    private function pairIsPending(ChatMessage $message): bool
    {
        $translation = $message->translation($this->pair);

        return ($translation['revision'] ?? null) === $this->attempt && $translation['status'] === 'pending';
    }

    private function updatePair(array $changes): void
    {
        // Serialize updates for the two independent pairs stored in one JSON column.
        DB::transaction(function () use ($changes): void {
            $message = $this->pending()->lockForUpdate()->first();
            if ($message && $this->pairIsPending($message)) {
                $message->storeTranslation($this->pair, array_replace($message->translation($this->pair), $changes));
            }
        }, 3);
    }
}
