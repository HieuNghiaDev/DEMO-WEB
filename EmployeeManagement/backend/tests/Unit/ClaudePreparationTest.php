<?php

namespace Tests\Unit;

use App\Services\ClaudeClient;
use App\Services\ClaudeToolSchemaConverter;
use App\Services\SkillLoader;
use App\Services\SystemPromptBuilder;
use App\Services\ToolRegistry;
use Illuminate\Support\Facades\Http;
use Mockery;
use RuntimeException;
use Tests\Support\AiTestDefinitions;
use Tests\TestCase;

class ClaudePreparationTest extends TestCase
{
    use AiTestDefinitions;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'anthropic.api_key' => 'test-anthropic-key',
            'anthropic.model' => 'test-claude-model',
            'anthropic.base_url' => 'https://api.anthropic.com',
            'anthropic.version' => '2023-06-01',
            'anthropic.max_tokens' => 512,
        ]);
    }

    public function test_client_uses_configured_key_and_model_and_normalizes_text(): void
    {
        Http::fake([
            'api.anthropic.com/v1/messages' => Http::response([
                'content' => [['type' => 'text', 'text' => 'こんにちは。']],
                'stop_reason' => 'end_turn',
            ]),
        ]);

        $response = app(ClaudeClient::class)->createMessage(
            system: 'System instructions',
            messages: [['role' => 'user', 'content' => 'Hello']],
        );

        $this->assertSame('こんにちは。', $response['text']);
        $this->assertSame([], $response['tool_uses']);
        $this->assertSame('end_turn', $response['stop_reason']);

        Http::assertSent(function ($request): bool {
            return $request->hasHeader('x-api-key', 'test-anthropic-key')
                && $request->hasHeader('anthropic-version', '2023-06-01')
                && $request['model'] === 'test-claude-model'
                && $request['max_tokens'] === 512;
        });
    }

    public function test_client_normalizes_tool_use_blocks(): void
    {
        Http::fake([
            'api.anthropic.com/v1/messages' => Http::response([
                'content' => [[
                    'type' => 'tool_use',
                    'id' => 'toolu_123',
                    'name' => 'list_tasks',
                    'input' => ['horizon' => 'short'],
                ]],
                'stop_reason' => 'tool_use',
            ]),
        ]);

        $response = app(ClaudeClient::class)->createMessage('System', [['role' => 'user', 'content' => 'Tasks']]);

        $this->assertSame('', $response['text']);
        $this->assertSame([[
            'id' => 'toolu_123',
            'name' => 'list_tasks',
            'input' => ['horizon' => 'short'],
        ]], $response['tool_uses']);
        $this->assertSame('tool_use', $response['stop_reason']);
    }

    public function test_converter_exposes_only_tools_declared_by_skill(): void
    {
        $tools = app(ClaudeToolSchemaConverter::class)->forSkill('test_assistance');

        $this->assertSame(['test_probe', 'request_approval'], array_column($tools, 'name'));
        $this->assertArrayHasKey('input_schema', $tools[0]);
        $this->assertContains('request_approval', array_column($tools, 'name'));
    }

    public function test_converter_reports_a_skill_tool_that_is_not_registered(): void
    {
        $skillLoader = Mockery::mock(SkillLoader::class);
        $skillLoader->shouldReceive('load')->with('invalid_skill')->andReturn([
            'name' => 'invalid_skill',
            'tools' => ['missing_tool'],
        ]);
        $converter = new ClaudeToolSchemaConverter(app(ToolRegistry::class), $skillLoader);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Skill declares unregistered tool [missing_tool].');

        $converter->forSkill('invalid_skill');
    }

    public function test_prompt_builder_combines_persona_and_skill_instructions(): void
    {
        $prompt = app(SystemPromptBuilder::class)->build('secretary', 'test_assistance');

        $this->assertStringContainsString('Bạn là AI Thư ký của THEMIS HQ.', $prompt);
        $this->assertStringContainsString('# Active skill: test_assistance', $prompt);
        $this->assertStringContainsString('Nếu thiếu thông tin quan trọng', $prompt);
    }
}
