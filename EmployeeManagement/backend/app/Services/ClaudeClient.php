<?php

namespace App\Services;

use App\Contracts\AIModelClient;
use Illuminate\Support\Facades\Http;
use LogicException;

class ClaudeClient implements AIModelClient
{
    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array{name: string, description: string, input_schema: array<string, mixed>}>  $tools
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    public function createMessage(string $system, array $messages, array $tools = []): array
    {
        $apiKey = config('anthropic.api_key');
        $model = config('anthropic.model');

        if (! is_string($apiKey) || $apiKey === '') {
            throw new LogicException('ANTHROPIC_API_KEY is not configured.');
        }

        if (! is_string($model) || $model === '') {
            throw new LogicException('ANTHROPIC_MODEL is not configured.');
        }

        $response = Http::baseUrl((string) config('anthropic.base_url'))
            ->acceptJson()
            ->withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => (string) config('anthropic.version'),
            ])
            ->post('/v1/messages', [
                'model' => $model,
                'max_tokens' => (int) config('anthropic.max_tokens'),
                'system' => $system,
                'messages' => $messages,
                'tools' => $tools,
            ])
            ->throw();

        /** @var array<string, mixed> $raw */
        $raw = $response->json();

        return $this->normalize($raw);
    }

    /**
     * @param  array<string, mixed>  $response
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    private function normalize(array $response): array
    {
        $text = [];
        $toolUses = [];

        foreach ($response['content'] ?? [] as $block) {
            if (! is_array($block)) {
                continue;
            }

            if (($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                $text[] = $block['text'];
            }

            if (($block['type'] ?? null) === 'tool_use') {
                $toolUses[] = [
                    'id' => (string) ($block['id'] ?? ''),
                    'name' => (string) ($block['name'] ?? ''),
                    'input' => is_array($block['input'] ?? null) ? $block['input'] : [],
                ];
            }
        }

        return [
            'text' => implode("\n", $text),
            'tool_uses' => $toolUses,
            'stop_reason' => is_string($response['stop_reason'] ?? null) ? $response['stop_reason'] : null,
            'raw' => $response,
        ];
    }
}
