<?php

namespace Tests\Unit;

use App\Contracts\AIModelClient;
use App\Services\AiProviderBusyException;
use App\Services\FailoverAIModelClient;
use Mockery;
use Tests\TestCase;

class FailoverAIModelClientTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_it_uses_fallback_when_primary_provider_is_busy(): void
    {
        $primary = Mockery::mock(AIModelClient::class);
        $fallback = Mockery::mock(AIModelClient::class);
        $expected = $this->response('Fallback response');

        $primary->shouldReceive('createMessage')
            ->once()
            ->andThrow(new AiProviderBusyException('busy'));
        $fallback->shouldReceive('createMessage')
            ->once()
            ->andReturn($expected);

        $client = new FailoverAIModelClient($primary, $fallback, 'groq', 'gemini');

        $this->assertSame($expected, $client->createMessage('System', [
            ['role' => 'user', 'content' => 'Hello'],
        ]));
    }

    public function test_service_container_builds_the_configured_provider_chain(): void
    {
        config([
            'ai.provider' => 'groq',
            'ai.fallback_provider' => 'gemini',
        ]);

        $this->assertInstanceOf(
            FailoverAIModelClient::class,
            app(AIModelClient::class),
        );
    }

    public function test_gemini_primary_keeps_a_fallback_started_tool_loop_on_fallback(): void
    {
        $primary = Mockery::mock(AIModelClient::class);
        $fallback = Mockery::mock(AIModelClient::class);
        $expected = $this->response('Tool completed');
        $messages = [
            ['role' => 'user', 'content' => 'Run a tool'],
            ['role' => 'assistant', 'content' => [[
                'type' => 'tool_use',
                'id' => 'call_123',
                'name' => 'demo_tool',
                'input' => [],
            ]]],
            ['role' => 'user', 'content' => [[
                'type' => 'tool_result',
                'tool_use_id' => 'call_123',
                'content' => '{}',
            ]]],
        ];

        $primary->shouldNotReceive('createMessage');
        $fallback->shouldReceive('createMessage')
            ->once()
            ->with('System', $messages, [])
            ->andReturn($expected);

        $client = new FailoverAIModelClient($primary, $fallback, 'gemini', 'groq');

        $this->assertSame($expected, $client->createMessage('System', $messages));
    }

    public function test_groq_primary_keeps_a_gemini_started_tool_loop_on_gemini(): void
    {
        $primary = Mockery::mock(AIModelClient::class);
        $fallback = Mockery::mock(AIModelClient::class);
        $expected = $this->response('Tool completed by Gemini');
        $messages = [
            ['role' => 'user', 'content' => 'Run a tool'],
            ['role' => 'assistant', 'content' => [[
                'type' => 'tool_use',
                'id' => 'gemini_tool_1',
                'name' => 'demo_tool',
                'input' => [],
                'thought_signature' => 'signed-by-gemini',
            ]]],
            ['role' => 'user', 'content' => [[
                'type' => 'tool_result',
                'tool_use_id' => 'gemini_tool_1',
                'content' => '{}',
            ]]],
        ];

        $primary->shouldNotReceive('createMessage');
        $fallback->shouldReceive('createMessage')
            ->once()
            ->with('System', $messages, [])
            ->andReturn($expected);

        $client = new FailoverAIModelClient($primary, $fallback, 'groq', 'gemini');

        $this->assertSame($expected, $client->createMessage('System', $messages));
    }

    public function test_it_converts_groq_tool_history_to_text_before_falling_back_to_gemini(): void
    {
        $primary = Mockery::mock(AIModelClient::class);
        $fallback = Mockery::mock(AIModelClient::class);
        $expected = $this->response('Completed by Gemini');
        $messages = [
            ['role' => 'user', 'content' => 'Run a tool'],
            ['role' => 'assistant', 'content' => [[
                'type' => 'tool_use',
                'id' => 'call_123',
                'name' => 'demo_tool',
                'input' => ['value' => 1],
            ]]],
            ['role' => 'user', 'content' => [[
                'type' => 'tool_result',
                'tool_use_id' => 'call_123',
                'content' => '{"ok":true}',
            ]]],
        ];

        $primary->shouldReceive('createMessage')
            ->once()
            ->andThrow(new AiProviderBusyException('busy'));
        $fallback->shouldReceive('createMessage')
            ->once()
            ->withArgs(function (string $system, array $converted, array $tools): bool {
                return $system === 'System'
                    && $tools === []
                    && is_string($converted[1]['content'] ?? null)
                    && str_contains($converted[1]['content'], 'demo_tool')
                    && is_string($converted[2]['content'] ?? null)
                    && str_contains($converted[2]['content'], '{"ok":true}');
            })
            ->andReturn($expected);

        $client = new FailoverAIModelClient($primary, $fallback, 'groq', 'gemini');

        $this->assertSame($expected, $client->createMessage('System', $messages));
    }

    /** @return array{text: string, tool_uses: array<never>, stop_reason: string, raw: array{content: array<never>}} */
    private function response(string $text): array
    {
        return [
            'text' => $text,
            'tool_uses' => [],
            'stop_reason' => 'stop',
            'raw' => ['content' => []],
        ];
    }
}
