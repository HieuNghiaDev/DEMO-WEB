<?php

namespace App\Services;

use App\Contracts\AIModelClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use LogicException;
use RuntimeException;

class GroqClient implements AIModelClient
{
    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array{name: string, description: string, input_schema: array<string, mixed>}>  $tools
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    public function createMessage(string $system, array $messages, array $tools = []): array
    {
        $apiKey = config('groq.api_key');
        $model = config('groq.model');

        if (! is_string($apiKey) || $apiKey === '') {
            throw new LogicException('GROQ_API_KEY is not configured.');
        }

        if (! is_string($model) || $model === '') {
            throw new LogicException('GROQ_MODEL is not configured.');
        }

        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ...$this->toGroqMessages($messages),
            ],
            'max_completion_tokens' => max(1, (int) config('groq.max_output_tokens')),
        ];
        $reasoningEffort = config('groq.reasoning_effort');

        if (is_string($reasoningEffort) && $reasoningEffort !== '') {
            $payload['reasoning_effort'] = $reasoningEffort;
        }

        if ($tools !== []) {
            $payload['tools'] = array_map(fn (array $tool): array => [
                'type' => 'function',
                'function' => [
                    'name' => $tool['name'],
                    'description' => $tool['description'],
                    'parameters' => $this->toGroqSchema($tool['input_schema']),
                ],
            ], $tools);
            $payload['tool_choice'] = 'auto';
            $payload['parallel_tool_calls'] = false;
        }

        return $this->normalize($this->send($payload, $model, $apiKey));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function send(array $payload, string $model, string $apiKey): array
    {
        $retries = max(0, (int) config('groq.retry_attempts'));

        for ($attempt = 0; $attempt <= $retries; $attempt++) {
            try {
                $response = Http::baseUrl((string) config('groq.base_url'))
                    ->acceptJson()
                    ->withToken($apiKey)
                    ->connectTimeout(max(1, (int) config('groq.connect_timeout_seconds')))
                    ->timeout(max(1, (int) config('groq.timeout_seconds')))
                    ->post('/v1/chat/completions', $payload);
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

            if ($attempt < $retries && $this->shouldRetry($response->status(), $response->json())) {
                $this->waitBeforeRetry($attempt);

                continue;
            }

            Log::warning('Groq provider request failed.', [
                'model' => $model,
                'status' => $response->status(),
                'attempts' => $attempt + 1,
            ]);
            $response->throw();
        }

        throw new RuntimeException('Groq provider request could not be completed.');
    }

    private function shouldRetry(int $status, mixed $body): bool
    {
        if (in_array($status, [429, 500, 502, 503, 504], true)) {
            return true;
        }

        return $status === 400
            && is_array($body)
            && isset($body['error']['failed_generation']);
    }

    private function waitBeforeRetry(int $attempt): void
    {
        $delayMs = max(0, (int) config('groq.retry_delay_ms')) * (2 ** $attempt);

        if ($delayMs > 0) {
            usleep($delayMs * 1000);
        }
    }

    /**
     * Keep provider schemas simple for models that only accept one concrete
     * JSON type per field. Nullable values remain optional by omission.
     *
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>
     */
    private function toGroqSchema(array $schema): array
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
                fn (mixed $property): mixed => is_array($property) ? $this->toGroqSchema($property) : $property,
                $converted['properties'],
            );
        }

        if (is_array($converted['items'] ?? null)) {
            $converted['items'] = $this->toGroqSchema($converted['items']);
        }

        return $converted;
    }

    /**
     * @param  list<array<string, mixed>>  $messages
     * @return list<array<string, mixed>>
     */
    private function toGroqMessages(array $messages): array
    {
        $converted = [];
        $toolNames = $this->toolNamesById($messages);

        foreach ($messages as $message) {
            $role = $message['role'] ?? null;
            $content = $message['content'] ?? null;

            if (! in_array($role, ['user', 'assistant'], true)) {
                throw new RuntimeException('AI conversation contains an unsupported message role.');
            }

            if (is_string($content)) {
                $converted[] = ['role' => $role, 'content' => $content];

                continue;
            }

            if (! is_array($content)) {
                throw new RuntimeException('AI conversation contains unsupported message content.');
            }

            if ($role === 'assistant') {
                $converted[] = $this->assistantMessage($content);

                continue;
            }

            foreach ($content as $block) {
                if (! is_array($block) || ($block['type'] ?? null) !== 'tool_result') {
                    continue;
                }

                $toolUseId = $block['tool_use_id'] ?? null;

                if (! is_string($toolUseId) || ! isset($toolNames[$toolUseId])) {
                    throw new RuntimeException('Groq tool result does not match a prior tool call.');
                }

                $converted[] = [
                    'role' => 'tool',
                    'tool_call_id' => $toolUseId,
                    'name' => $toolNames[$toolUseId],
                    'content' => (string) ($block['content'] ?? ''),
                ];
            }
        }

        return $converted;
    }

    /**
     * @param  list<array<string, mixed>>  $content
     * @return array<string, mixed>
     */
    private function assistantMessage(array $content): array
    {
        $text = [];
        $toolCalls = [];

        foreach ($content as $block) {
            if (! is_array($block)) {
                continue;
            }

            if (($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                $text[] = $block['text'];
            }

            if (($block['type'] ?? null) === 'tool_use' && is_string($block['id'] ?? null)) {
                $toolCalls[] = [
                    'id' => $block['id'],
                    'type' => 'function',
                    'function' => [
                        'name' => (string) ($block['name'] ?? ''),
                        'arguments' => json_encode(
                            is_array($block['input'] ?? null) ? $block['input'] : [],
                            JSON_THROW_ON_ERROR,
                        ),
                    ],
                ];
            }
        }

        $message = [
            'role' => 'assistant',
            'content' => $text === [] ? null : implode("\n", $text),
        ];

        if ($toolCalls !== []) {
            $message['tool_calls'] = $toolCalls;
        }

        return $message;
    }

    /**
     * @param  list<array<string, mixed>>  $messages
     * @return array<string, string>
     */
    private function toolNamesById(array $messages): array
    {
        $toolNames = [];

        foreach ($messages as $message) {
            if (($message['role'] ?? null) !== 'assistant' || ! is_array($message['content'] ?? null)) {
                continue;
            }

            foreach ($message['content'] as $block) {
                if (
                    is_array($block)
                    && ($block['type'] ?? null) === 'tool_use'
                    && is_string($block['id'] ?? null)
                ) {
                    $toolNames[$block['id']] = (string) ($block['name'] ?? '');
                }
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
        $choice = $response['choices'][0] ?? null;
        $message = is_array($choice) ? ($choice['message'] ?? null) : null;

        if (! is_array($message)) {
            throw new RuntimeException('Groq returned no response choice.');
        }

        $text = is_string($message['content'] ?? null) ? $message['content'] : '';
        $toolUses = [];
        $content = $text === '' ? [] : [['type' => 'text', 'text' => $text]];

        foreach ($message['tool_calls'] ?? [] as $index => $toolCall) {
            if (! is_array($toolCall) || ! is_array($toolCall['function'] ?? null)) {
                continue;
            }

            $arguments = json_decode((string) ($toolCall['function']['arguments'] ?? '{}'), true);
            $id = is_string($toolCall['id'] ?? null) && $toolCall['id'] !== ''
                ? $toolCall['id']
                : 'groq_tool_'.($index + 1);
            $name = (string) ($toolCall['function']['name'] ?? '');
            $input = is_array($arguments) ? $arguments : [];
            $toolUses[] = ['id' => $id, 'name' => $name, 'input' => $input];
            $content[] = [
                'type' => 'tool_use',
                'id' => $id,
                'name' => $name,
                'input' => $input,
                'provider_id' => $id,
            ];
        }

        $finishReason = is_string($choice['finish_reason'] ?? null) ? $choice['finish_reason'] : null;

        if (trim($text) === '' && $toolUses === []) {
            throw new AiProviderBusyException('Groq returned an empty completion.');
        }

        return [
            'text' => $text,
            'tool_uses' => $toolUses,
            'stop_reason' => $toolUses !== [] ? 'tool_use' : $finishReason,
            'raw' => ['content' => $content],
        ];
    }
}
