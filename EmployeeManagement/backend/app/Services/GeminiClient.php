<?php

namespace App\Services;

use App\Contracts\AIModelClient;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use LogicException;
use RuntimeException;

class GeminiClient implements AIModelClient
{
    /**
     * Gemini's REST API has a different conversation format to Claude's API.
     * This client keeps the orchestrator provider-neutral by translating the
     * existing canonical history and tool blocks at the API boundary.
     *
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array{name: string, description: string, input_schema: array<string, mixed>}>  $tools
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    public function createMessage(string $system, array $messages, array $tools = []): array
    {
        $apiKey = config('gemini.api_key');
        $model = config('gemini.model');

        if (! is_string($apiKey) || $apiKey === '') {
            throw new LogicException('GEMINI_API_KEY is not configured.');
        }

        if (! is_string($model) || $model === '') {
            throw new LogicException('GEMINI_MODEL is not configured.');
        }

        $payload = [
            'systemInstruction' => ['parts' => [['text' => $system]]],
            'contents' => $this->toGeminiContents($messages),
            'generationConfig' => ['maxOutputTokens' => (int) config('gemini.max_output_tokens')],
        ];

        if ($tools !== []) {
            $payload['tools'] = [['functionDeclarations' => array_map(fn (array $tool): array => [
                'name' => $tool['name'],
                'description' => $tool['description'],
                'parameters' => $this->toGeminiSchema($tool['input_schema']),
            ], $tools)]];
        }

        try {
            $raw = $this->generateContent($model, $apiKey, $payload);
        } catch (RequestException $exception) {
            $fallbackModel = config('gemini.fallback_model');

            if (! $this->shouldUseFallback($exception, $model, $fallbackModel)) {
                throw $exception;
            }

            /** @var string $fallbackModel */
            $raw = $this->generateContent($fallbackModel, $apiKey, $payload);
        }

        return $this->normalize($raw);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function generateContent(string $model, string $apiKey, array $payload): array
    {
        $lock = $this->acquireRequestLock();
        $retries = max(0, (int) config('gemini.retry_attempts'));

        try {
            for ($attempt = 0; $attempt <= $retries; $attempt++) {
                try {
                    $response = Http::baseUrl((string) config('gemini.base_url'))
                        ->acceptJson()
                        ->withHeaders(['x-goog-api-key' => $apiKey])
                        ->connectTimeout(max(1, (int) config('gemini.connect_timeout_seconds')))
                        ->timeout(max(1, (int) config('gemini.timeout_seconds')))
                        ->post('/v1beta/models/'.rawurlencode($model).':generateContent', $payload);
                } catch (ConnectionException $exception) {
                    if ($attempt < $retries) {
                        $this->waitBeforeRetry($attempt);

                        continue;
                    }

                    throw $exception;
                }

                if ($response->successful()) {
                    /** @var array<string, mixed> $raw */
                    $raw = $response->json();

                    return $raw;
                }

                if ($attempt < $retries && in_array($response->status(), [429, 503], true)) {
                    $this->waitBeforeRetry($attempt);

                    continue;
                }

                Log::warning('Gemini provider request failed.', [
                    'model' => $model,
                    'status' => $response->status(),
                    'attempts' => $attempt + 1,
                ]);
                $response->throw();
            }

            throw new RuntimeException('Gemini provider request could not be completed.');
        } finally {
            $lock?->release();
        }
    }

    private function acquireRequestLock(): ?Lock
    {
        $maxConcurrentRequests = max(0, (int) config('gemini.max_concurrent_requests'));

        if ($maxConcurrentRequests === 0) {
            return null;
        }

        $deadline = microtime(true) + (max(0, (int) config('gemini.concurrency_wait_ms')) / 1000);

        do {
            for ($slot = 1; $slot <= $maxConcurrentRequests; $slot++) {
                $lock = Cache::lock("themis:gemini:slot:{$slot}", 90);

                if ($lock->get()) {
                    return $lock;
                }
            }

            usleep(100_000);
        } while (microtime(true) < $deadline);

        throw new AiProviderBusyException('The AI provider is handling other requests.');
    }

    private function waitBeforeRetry(int $attempt): void
    {
        $delayMs = max(0, (int) config('gemini.retry_delay_ms')) * (2 ** $attempt);

        if ($delayMs > 0) {
            usleep($delayMs * 1000);
        }
    }

    private function shouldUseFallback(RequestException $exception, string $model, mixed $fallbackModel): bool
    {
        return in_array($exception->response->status(), [429, 503], true)
            && is_string($fallbackModel)
            && $fallbackModel !== ''
            && $fallbackModel !== $model;
    }

    /**
     * Gemini accepts a subset of JSON Schema. In particular, optional fields
     * are already nullable by omission, so union types such as
     * ["string", "null"] must be reduced to their concrete type.
     *
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>
     */
    private function toGeminiSchema(array $schema): array
    {
        $converted = $schema;

        if (is_array($converted['type'] ?? null)) {
            $types = array_values(array_filter(
                $converted['type'],
                fn (mixed $type): bool => is_string($type) && $type !== 'null',
            ));
            $converted['type'] = $types[0] ?? 'string';
        }

        if (is_array($converted['properties'] ?? null)) {
            $converted['properties'] = array_map(
                fn (mixed $property): mixed => is_array($property) ? $this->toGeminiSchema($property) : $property,
                $converted['properties'],
            );
        }

        if (is_array($converted['items'] ?? null)) {
            $converted['items'] = $this->toGeminiSchema($converted['items']);
        }

        return $converted;
    }

    /**
     * @param  list<array<string, mixed>>  $messages
     * @return list<array{role: string, parts: list<array<string, mixed>>}>
     */
    private function toGeminiContents(array $messages): array
    {
        $messages = $this->mergeConsecutiveTextMessages($messages);
        $toolNames = $this->toolNamesById($messages);

        return array_map(function (array $message) use ($toolNames): array {
            $role = $message['role'] ?? null;

            if (! in_array($role, ['user', 'assistant'], true)) {
                throw new RuntimeException('AI conversation contains an unsupported message role.');
            }

            $content = $message['content'] ?? null;

            if (is_string($content)) {
                return [
                    'role' => $role === 'assistant' ? 'model' : 'user',
                    'parts' => [['text' => $content]],
                ];
            }

            if (! is_array($content)) {
                throw new RuntimeException('AI conversation contains unsupported message content.');
            }

            return [
                'role' => $role === 'assistant' ? 'model' : 'user',
                'parts' => $role === 'assistant'
                    ? $this->assistantParts($content)
                    : $this->toolResultParts($content, $toolNames),
            ];
        }, $messages);
    }

    /**
     * Gemini requires alternating user/model turns. A user can submit another
     * message after a failed request, so merge adjacent text turns instead of
     * sending an invalid conversation history back to the provider.
     *
     * @param  list<array<string, mixed>>  $messages
     * @return list<array<string, mixed>>
     */
    private function mergeConsecutiveTextMessages(array $messages): array
    {
        $merged = [];

        foreach ($messages as $message) {
            $lastIndex = array_key_last($merged);
            $lastMessage = $lastIndex === null ? null : $merged[$lastIndex];

            if (
                is_array($lastMessage)
                && ($lastMessage['role'] ?? null) === ($message['role'] ?? null)
                && is_string($lastMessage['content'] ?? null)
                && is_string($message['content'] ?? null)
            ) {
                $merged[$lastIndex]['content'] .= "\n\n".$message['content'];

                continue;
            }

            $merged[] = $message;
        }

        return $merged;
    }

    /** @param list<array<string, mixed>> $content
     * @return list<array<string, mixed>>
     */
    private function assistantParts(array $content): array
    {
        $parts = [];

        foreach ($content as $block) {
            if (! is_array($block)) {
                continue;
            }

            if (($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                $part = ['text' => $block['text']];

                if (is_string($block['thought_signature'] ?? null) && $block['thought_signature'] !== '') {
                    $part['thoughtSignature'] = $block['thought_signature'];
                }

                $parts[] = $part;
            }

            if (($block['type'] ?? null) === 'tool_use') {
                $functionCall = [
                    'name' => (string) ($block['name'] ?? ''),
                    'args' => is_array($block['input'] ?? null) ? $block['input'] : [],
                ];

                if (is_string($block['provider_id'] ?? null) && $block['provider_id'] !== '') {
                    $functionCall['id'] = $block['provider_id'];
                }

                $part = ['functionCall' => $functionCall];

                if (is_string($block['thought_signature'] ?? null) && $block['thought_signature'] !== '') {
                    $part['thoughtSignature'] = $block['thought_signature'];
                }

                $parts[] = $part;
            }
        }

        return $parts;
    }

    /**
     * @param  list<array<string, mixed>>  $content
     * @param  array<string, array{name: string, provider_id: string|null}>  $toolNames
     * @return list<array<string, mixed>>
     */
    private function toolResultParts(array $content, array $toolNames): array
    {
        $parts = [];

        foreach ($content as $block) {
            if (! is_array($block) || ($block['type'] ?? null) !== 'tool_result') {
                continue;
            }

            $toolUseId = $block['tool_use_id'] ?? null;
            $tool = is_string($toolUseId) ? ($toolNames[$toolUseId] ?? null) : null;

            if ($tool === null) {
                throw new RuntimeException('Gemini tool result does not match a prior tool call.');
            }

            $decodedContent = json_decode((string) ($block['content'] ?? ''), true);
            $result = is_array($decodedContent) && ! array_is_list($decodedContent)
                ? $decodedContent
                : ['result' => $decodedContent];
            $functionResponse = [
                'name' => $tool['name'],
                'response' => $result,
            ];

            if ($tool['provider_id'] !== null) {
                $functionResponse['id'] = $tool['provider_id'];
            }

            $parts[] = ['functionResponse' => $functionResponse];
        }

        return $parts;
    }

    /**
     * @param  list<array<string, mixed>>  $messages
     * @return array<string, array{name: string, provider_id: string|null}>
     */
    private function toolNamesById(array $messages): array
    {
        $toolNames = [];

        foreach ($messages as $message) {
            if (($message['role'] ?? null) !== 'assistant' || ! is_array($message['content'] ?? null)) {
                continue;
            }

            foreach ($message['content'] as $block) {
                if (! is_array($block) || ($block['type'] ?? null) !== 'tool_use' || ! is_string($block['id'] ?? null)) {
                    continue;
                }

                $toolNames[$block['id']] = [
                    'name' => (string) ($block['name'] ?? ''),
                    'provider_id' => is_string($block['provider_id'] ?? null) ? $block['provider_id'] : null,
                ];
            }
        }

        return $toolNames;
    }

    /**
     * @param  array<string, mixed>  $response
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    private function normalize(array $response): array
    {
        $candidate = $response['candidates'][0] ?? null;

        if (! is_array($candidate) || ! is_array($candidate['content'] ?? null)) {
            $message = is_string($response['promptFeedback']['blockReasonMessage'] ?? null)
                ? $response['promptFeedback']['blockReasonMessage']
                : 'Gemini returned no response candidate.';

            throw new RuntimeException($message);
        }

        $text = [];
        $toolUses = [];
        $content = [];

        foreach ($candidate['content']['parts'] ?? [] as $index => $part) {
            if (! is_array($part)) {
                continue;
            }

            if (is_string($part['text'] ?? null)) {
                $text[] = $part['text'];
                $textBlock = ['type' => 'text', 'text' => $part['text']];

                if (is_string($part['thoughtSignature'] ?? null) && $part['thoughtSignature'] !== '') {
                    $textBlock['thought_signature'] = $part['thoughtSignature'];
                }

                $content[] = $textBlock;
            }

            if (! is_array($part['functionCall'] ?? null)) {
                continue;
            }

            $functionCall = $part['functionCall'];
            $id = 'gemini_tool_'.($index + 1);
            $providerId = is_string($functionCall['id'] ?? null) && $functionCall['id'] !== ''
                ? $functionCall['id']
                : null;
            $toolUses[] = [
                'id' => $id,
                'name' => (string) ($functionCall['name'] ?? ''),
                'input' => is_array($functionCall['args'] ?? null) ? $functionCall['args'] : [],
            ];
            $content[] = [
                'type' => 'tool_use',
                'id' => $id,
                'name' => (string) ($functionCall['name'] ?? ''),
                'input' => is_array($functionCall['args'] ?? null) ? $functionCall['args'] : [],
                'provider_id' => $providerId,
                'thought_signature' => is_string($part['thoughtSignature'] ?? null)
                    ? $part['thoughtSignature']
                    : null,
            ];
        }

        $finishReason = is_string($candidate['finishReason'] ?? null) ? $candidate['finishReason'] : null;

        if ($text === [] && $toolUses === []) {
            throw new AiProviderBusyException('Gemini returned an empty completion.');
        }

        return [
            'text' => implode("\n", $text),
            'tool_uses' => $toolUses,
            'stop_reason' => $toolUses !== [] ? 'tool_use' : $finishReason,
            'raw' => ['content' => $content],
        ];
    }
}
