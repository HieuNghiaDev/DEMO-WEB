<?php

namespace Tests\Unit;

use App\Services\AiProviderBusyException;
use App\Services\GroqClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GroqClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'groq.api_key' => 'test-groq-key',
            'groq.model' => 'test-groq-model',
            'groq.base_url' => 'https://api.groq.com/openai',
            'groq.max_output_tokens' => 512,
            'groq.reasoning_effort' => 'low',
            'groq.retry_attempts' => 0,
            'groq.retry_delay_ms' => 0,
            'groq.connect_timeout_seconds' => 3,
            'groq.timeout_seconds' => 8,
        ]);
    }

    public function test_client_sends_an_openai_compatible_request_and_normalizes_text(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'choices' => [[
                    'message' => ['role' => 'assistant', 'content' => 'Xin chào từ Groq.'],
                    'finish_reason' => 'stop',
                ]],
            ]),
        ]);

        $response = app(GroqClient::class)->createMessage(
            system: 'System instructions',
            messages: [['role' => 'user', 'content' => 'Hello']],
            tools: [[
                'name' => 'list_tasks',
                'description' => 'List tasks.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => ['horizon' => ['type' => 'string']],
                ],
            ]],
        );

        $this->assertSame('Xin chào từ Groq.', $response['text']);
        $this->assertSame([], $response['tool_uses']);
        $this->assertSame('stop', $response['stop_reason']);

        Http::assertSent(function ($request): bool {
            return $request->hasHeader('Authorization', 'Bearer test-groq-key')
                && $request->url() === 'https://api.groq.com/openai/v1/chat/completions'
                && $request['model'] === 'test-groq-model'
                && $request['max_completion_tokens'] === 512
                && $request['messages'][0] === ['role' => 'system', 'content' => 'System instructions']
                && $request['tools'][0]['function']['name'] === 'list_tasks'
                && $request['tool_choice'] === 'auto'
                && $request['parallel_tool_calls'] === false
                && $request['reasoning_effort'] === 'low';
        });
    }

    public function test_client_normalizes_tool_calls_and_returns_tool_results(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_123',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'list_tasks',
                                    'arguments' => '{"horizon":"short"}',
                                ],
                            ]],
                        ],
                        'finish_reason' => 'tool_calls',
                    ]],
                ])
                ->push([
                    'choices' => [[
                        'message' => ['role' => 'assistant', 'content' => 'Không có task ngắn hạn.'],
                        'finish_reason' => 'stop',
                    ]],
                ]),
        ]);

        $first = app(GroqClient::class)->createMessage('System', [
            ['role' => 'user', 'content' => 'Show tasks'],
        ]);

        $this->assertSame('tool_use', $first['stop_reason']);
        $this->assertSame([
            'id' => 'call_123',
            'name' => 'list_tasks',
            'input' => ['horizon' => 'short'],
        ], $first['tool_uses'][0]);

        $second = app(GroqClient::class)->createMessage('System', [
            ['role' => 'user', 'content' => 'Show tasks'],
            ['role' => 'assistant', 'content' => $first['raw']['content']],
            ['role' => 'user', 'content' => [[
                'type' => 'tool_result',
                'tool_use_id' => 'call_123',
                'content' => json_encode(['tasks' => []], JSON_THROW_ON_ERROR),
            ]]],
        ]);

        $this->assertSame('Không có task ngắn hạn.', $second['text']);

        Http::assertSent(function ($request): bool {
            return count($request['messages'] ?? []) === 4
                && ($request['messages'][2]['role'] ?? null) === 'assistant'
                && ($request['messages'][2]['tool_calls'][0]['id'] ?? null) === 'call_123'
                && ($request['messages'][3]['role'] ?? null) === 'tool'
                && ($request['messages'][3]['tool_call_id'] ?? null) === 'call_123'
                && ($request['messages'][3]['name'] ?? null) === 'list_tasks';
        });
    }

    public function test_client_retries_an_invalid_generated_tool_call(): void
    {
        config(['groq.retry_attempts' => 1]);
        Http::fake([
            'api.groq.com/*' => Http::sequence()
                ->push([
                    'error' => [
                        'message' => 'Invalid tool call generated',
                        'failed_generation' => ['reason' => 'Arguments are not valid JSON'],
                    ],
                ], 400)
                ->push([
                    'choices' => [[
                        'message' => ['role' => 'assistant', 'content' => 'Recovered.'],
                        'finish_reason' => 'stop',
                    ]],
                ]),
        ]);

        $response = app(GroqClient::class)->createMessage(
            'System',
            [['role' => 'user', 'content' => 'Hello']],
        );

        $this->assertSame('Recovered.', $response['text']);
        Http::assertSentCount(2);
    }

    public function test_client_rejects_an_empty_reasoning_only_completion(): void
    {
        Http::fake([
            'api.groq.com/*' => Http::response([
                'choices' => [[
                    'message' => ['role' => 'assistant', 'content' => null, 'reasoning' => 'Thinking'],
                    'finish_reason' => 'length',
                ]],
            ]),
        ]);

        $this->expectException(AiProviderBusyException::class);

        app(GroqClient::class)->createMessage(
            'System',
            [['role' => 'user', 'content' => 'Hello']],
        );
    }
}
