<?php

namespace Tests\Unit;

use App\Services\GeminiClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'gemini.api_key' => 'test-gemini-key',
            'gemini.model' => 'test-gemini-model',
            'gemini.fallback_model' => null,
            'gemini.base_url' => 'https://generativelanguage.googleapis.com',
            'gemini.max_output_tokens' => 512,
            'gemini.retry_attempts' => 0,
            'gemini.retry_delay_ms' => 0,
        ]);
    }

    public function test_client_sends_the_gemini_request_and_normalizes_text(): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [['text' => 'Xin chào từ Gemini.']]],
                    'finishReason' => 'STOP',
                ]],
            ]),
        ]);

        $response = app(GeminiClient::class)->createMessage(
            system: 'System instructions',
            messages: [['role' => 'user', 'content' => 'Hello']],
            tools: [[
                'name' => 'list_tasks',
                'description' => 'List tasks.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'assigned_to' => ['type' => ['string', 'null']],
                    ],
                ],
            ]],
        );

        $this->assertSame('Xin chào từ Gemini.', $response['text']);
        $this->assertSame([], $response['tool_uses']);
        $this->assertSame('STOP', $response['stop_reason']);

        Http::assertSent(function ($request): bool {
            return $request->hasHeader('x-goog-api-key', 'test-gemini-key')
                && $request['systemInstruction']['parts'][0]['text'] === 'System instructions'
                && $request['generationConfig']['maxOutputTokens'] === 512
                && $request['tools'][0]['functionDeclarations'][0]['parameters'] === [
                    'type' => 'object',
                    'properties' => [
                        'assigned_to' => ['type' => 'string'],
                    ],
                ];
        });
    }

    public function test_client_normalizes_function_calls_and_returns_results_with_the_call_id(): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'functionCall' => [
                            'id' => 'call_123',
                            'name' => 'list_tasks',
                            'args' => ['horizon' => 'short'],
                        ],
                        'thoughtSignature' => 'encrypted-signature-123',
                    ]]],
                    'finishReason' => 'STOP',
                ]],
            ]),
        ]);

        $response = app(GeminiClient::class)->createMessage('System', [
            ['role' => 'user', 'content' => 'Show tasks'],
        ]);

        $this->assertSame('tool_use', $response['stop_reason']);
        $this->assertSame('list_tasks', $response['tool_uses'][0]['name']);
        $this->assertSame(['horizon' => 'short'], $response['tool_uses'][0]['input']);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [['text' => 'No short tasks found.']]],
                    'finishReason' => 'STOP',
                ]],
            ]),
        ]);

        app(GeminiClient::class)->createMessage('System', [
            ['role' => 'user', 'content' => 'Show tasks'],
            ['role' => 'assistant', 'content' => $response['raw']['content']],
            ['role' => 'user', 'content' => [[
                'type' => 'tool_result',
                'tool_use_id' => 'gemini_tool_1',
                'content' => json_encode(['tasks' => []], JSON_THROW_ON_ERROR),
            ]]],
        ]);

        Http::assertSent(function ($request): bool {
            $functionResponse = $request['contents'][2]['parts'][0]['functionResponse'] ?? null;

            return is_array($functionResponse)
                && $functionResponse['name'] === 'list_tasks'
                && $functionResponse['id'] === 'call_123'
                && $functionResponse['response'] === ['tasks' => []]
                && $request['contents'][1]['parts'][0]['thoughtSignature'] === 'encrypted-signature-123';
        });
    }

    public function test_client_retries_once_with_the_fallback_model_after_a_temporary_provider_failure(): void
    {
        config(['gemini.fallback_model' => 'fallback-gemini-model']);
        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models/test-gemini-model:generateContent' => Http::response([], 503),
            'generativelanguage.googleapis.com/v1beta/models/fallback-gemini-model:generateContent' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [['text' => 'Fallback response.']]],
                    'finishReason' => 'STOP',
                ]],
            ]),
        ]);

        $response = app(GeminiClient::class)->createMessage(
            'System',
            [['role' => 'user', 'content' => 'Hello']],
        );

        $this->assertSame('Fallback response.', $response['text']);
        Http::assertSentCount(2);
    }

    public function test_client_retries_a_temporary_failure_before_returning_a_response(): void
    {
        config(['gemini.retry_attempts' => 1]);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push([], 503)
                ->push([
                    'candidates' => [[
                        'content' => ['parts' => [['text' => 'Retry response.']]],
                        'finishReason' => 'STOP',
                    ]],
                ]),
        ]);

        $response = app(GeminiClient::class)->createMessage(
            'System',
            [['role' => 'user', 'content' => 'Hello']],
        );

        $this->assertSame('Retry response.', $response['text']);
        Http::assertSentCount(2);
    }

    public function test_client_merges_consecutive_user_messages_after_a_failed_turn(): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [['text' => 'Understood.']]],
                    'finishReason' => 'STOP',
                ]],
            ]),
        ]);

        app(GeminiClient::class)->createMessage('System', [
            ['role' => 'user', 'content' => 'First request failed.'],
            ['role' => 'user', 'content' => 'Please answer this message.'],
        ]);

        Http::assertSent(function ($request): bool {
            return count($request['contents']) === 1
                && $request['contents'][0]['role'] === 'user'
                && $request['contents'][0]['parts'][0]['text'] === "First request failed.\n\nPlease answer this message.";
        });
    }
}
