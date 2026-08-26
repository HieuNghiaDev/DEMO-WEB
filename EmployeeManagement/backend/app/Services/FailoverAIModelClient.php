<?php

namespace App\Services;

use App\Contracts\AIModelClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Log;

class FailoverAIModelClient implements AIModelClient
{
    public function __construct(
        private readonly AIModelClient $primary,
        private readonly AIModelClient $fallback,
        private readonly string $primaryName,
        private readonly string $fallbackName,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array{name: string, description: string, input_schema: array<string, mixed>}>  $tools
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    public function createMessage(string $system, array $messages, array $tools = []): array
    {
        if ($this->mustContinueWithFallback($messages)) {
            return $this->fallback->createMessage($system, $messages, $tools);
        }

        try {
            return $this->primary->createMessage($system, $messages, $tools);
        } catch (AiProviderBusyException|ConnectionException|RequestException $exception) {
            Log::warning('Primary AI provider failed; switching to fallback.', [
                'primary_provider' => $this->primaryName,
                'fallback_provider' => $this->fallbackName,
                'exception' => $exception::class,
                'status' => $exception instanceof RequestException
                    ? $exception->response->status()
                    : null,
            ]);

            return $this->fallback->createMessage(
                $system,
                $this->messagesForFallback($messages),
                $tools,
            );
        }
    }

    /**
     * Keep a tool loop on the provider which started it. Gemini calls carry a
     * thought signature while Groq calls do not, which gives us a provider-safe
     * marker without exposing provider details to the orchestrator.
     *
     * @param  list<array<string, mixed>>  $messages
     */
    private function mustContinueWithFallback(array $messages): bool
    {
        foreach (array_reverse($messages) as $message) {
            if (($message['role'] ?? null) !== 'assistant' || ! is_array($message['content'] ?? null)) {
                continue;
            }

            foreach ($message['content'] as $block) {
                if (! is_array($block) || ($block['type'] ?? null) !== 'tool_use') {
                    continue;
                }

                $startedByGemini = is_string($block['thought_signature'] ?? null)
                    && $block['thought_signature'] !== '';

                return ($this->primaryName === 'gemini' && ! $startedByGemini)
                    || ($this->fallbackName === 'gemini' && $startedByGemini);
            }

            return false;
        }

        return false;
    }

    /**
     * Gemini cannot accept an unsigned function-call block produced by Groq.
     * If Groq fails after a tool has already run, preserve the call and result
     * as plain conversation text so Gemini can still finish the user's request.
     *
     * @param  list<array<string, mixed>>  $messages
     * @return list<array<string, mixed>>
     */
    private function messagesForFallback(array $messages): array
    {
        if ($this->fallbackName !== 'gemini') {
            return $messages;
        }

        $toolNames = [];
        $converted = [];

        foreach ($messages as $message) {
            $content = $message['content'] ?? null;

            if (! is_array($content)) {
                $converted[] = $message;

                continue;
            }

            if (($message['role'] ?? null) === 'assistant') {
                $parts = [];

                foreach ($content as $block) {
                    if (! is_array($block)) {
                        continue;
                    }

                    if (($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                        $parts[] = $block['text'];
                    }

                    if (($block['type'] ?? null) === 'tool_use' && is_string($block['id'] ?? null)) {
                        $toolNames[$block['id']] = (string) ($block['name'] ?? 'tool');
                        $parts[] = sprintf(
                            'The assistant called tool %s with input: %s',
                            $toolNames[$block['id']],
                            json_encode($block['input'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        );
                    }
                }

                $converted[] = ['role' => 'assistant', 'content' => implode("\n", $parts)];

                continue;
            }

            $results = [];

            foreach ($content as $block) {
                if (! is_array($block) || ($block['type'] ?? null) !== 'tool_result') {
                    continue;
                }

                $toolUseId = is_string($block['tool_use_id'] ?? null) ? $block['tool_use_id'] : '';
                $results[] = sprintf(
                    'Tool %s returned: %s',
                    $toolNames[$toolUseId] ?? 'tool',
                    (string) ($block['content'] ?? ''),
                );
            }

            $converted[] = ['role' => 'user', 'content' => implode("\n", $results)];
        }

        return $converted;
    }
}
