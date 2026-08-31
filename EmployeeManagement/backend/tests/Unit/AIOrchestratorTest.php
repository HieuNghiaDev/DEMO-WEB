<?php

namespace Tests\Unit;

use App\AI\Tools\LogActionTool;
use App\Services\AIOrchestrator;
use App\Services\ClaudeClient;
use App\Services\ClaudeToolSchemaConverter;
use App\Services\PersonaLoader;
use App\Services\SkillLoader;
use App\Services\SystemPromptBuilder;
use App\Services\ToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use RuntimeException;
use Tests\Support\AiTestDefinitions;
use Tests\TestCase;

class AIOrchestratorTest extends TestCase
{
    use AiTestDefinitions;
    use RefreshDatabase;

    public function test_it_returns_a_final_text_response_without_tools(): void
    {
        [$orchestrator, $client] = $this->orchestrator([self::textResponse('Ready.')]);

        $result = $orchestrator->runSkill('secretary', 'test_assistance', self::messages());

        $this->assertSame('Ready.', $result['text']);
        $this->assertSame('secretary', $result['persona']);
        $this->assertSame([], $result['tool_executions']);
        $this->assertCount(1, $client->calls);
    }

    public function test_it_includes_only_safe_page_identifiers_in_the_system_prompt(): void
    {
        [$orchestrator, $client] = $this->orchestrator([self::textResponse('Ready.')]);

        $orchestrator->runSkill(
            'secretary',
            'test_assistance',
            self::messages(),
            [
                'trigger_type' => 'chat',
                'page_context' => [
                    'page' => 'business_quest',
                    'case_id' => 25,
                    'customer_name' => 'must not reach the model',
                ],
            ],
        );

        $systemPrompt = $client->calls[0]['system'];
        $this->assertStringContainsString('{"page":"business_quest","case_id":25}', $systemPrompt);
        $this->assertStringNotContainsString('customer_name', $systemPrompt);
        $this->assertStringNotContainsString('must not reach the model', $systemPrompt);
    }

    public function test_it_executes_a_test_tool_and_sends_its_tool_result_back(): void
    {
        [$orchestrator, $client] = $this->orchestrator([
            self::toolResponse('toolu_list', 'test_probe', ['horizon' => 'short']),
            self::textResponse('No short tasks found.'),
        ]);

        $result = $orchestrator->runSkill('secretary', 'test_assistance', self::messages());

        $this->assertSame('No short tasks found.', $result['text']);
        $this->assertSame('test_probe', $result['tool_executions'][0]['name']);
        $toolResult = $client->calls[1]['messages'][2]['content'][0];
        $this->assertSame('tool_result', $toolResult['type']);
        $this->assertSame('toolu_list', $toolResult['tool_use_id']);
        $this->assertDatabaseHas('secretary_logs', ['skill_name' => 'test_assistance', 'status' => 'success']);
    }

    public function test_it_handles_multiple_consecutive_tool_iterations(): void
    {
        [$orchestrator] = $this->orchestrator([
            self::toolResponse('toolu_list', 'test_probe', []),
            self::toolResponse('toolu_create', 'test_probe', ['title' => 'File petition', 'horizon' => 'short']),
            self::textResponse('Task created.'),
        ]);

        $result = $orchestrator->runSkill('secretary', 'test_assistance', self::messages());

        $this->assertSame('Task created.', $result['text']);
        $this->assertCount(2, $result['tool_executions']);
        $this->assertSame('File petition', $result['tool_executions'][1]['output']['title']);
        $this->assertDatabaseCount('secretary_logs', 2);
    }

    public function test_it_blocks_a_registered_tool_not_allowed_by_the_skill(): void
    {
        [$orchestrator] = $this->orchestrator([
            self::toolResponse('toolu_approval', 'request_approval', ['action_type' => 'send_email']),
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Claude requested tool [request_approval] which is not allowed by skill [test_briefing].');

        $orchestrator->runSkill('secretary', 'test_briefing', self::messages());
    }

    public function test_it_blocks_an_unregistered_tool(): void
    {
        [$orchestrator] = $this->orchestrator([
            self::toolResponse('toolu_missing', 'missing_tool', []),
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Claude requested unregistered tool [missing_tool].');

        $orchestrator->runSkill('secretary', 'test_assistance', self::messages());
    }

    public function test_it_blocks_a_skill_not_allowed_by_the_persona(): void
    {
        $personaLoader = Mockery::mock(PersonaLoader::class);
        $personaLoader->shouldReceive('load')->with('restricted')->andReturn([
            'name' => 'restricted',
            'skills' => [],
            'instructions' => 'Restricted.',
        ]);
        [$orchestrator] = $this->orchestrator([], $personaLoader);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Persona [restricted] does not allow skill [test_assistance].');

        $orchestrator->runSkill('restricted', 'test_assistance', self::messages());
    }

    public function test_it_blocks_when_max_tool_iterations_is_exceeded(): void
    {
        config(['ai.orchestrator.max_iterations' => 1]);
        [$orchestrator] = $this->orchestrator([
            self::toolResponse('toolu_one', 'test_probe', []),
            self::toolResponse('toolu_two', 'test_probe', []),
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('AI orchestrator exceeded the maximum of 1 tool iterations.');

        $orchestrator->runSkill('secretary', 'test_assistance', self::messages());
    }

    public function test_it_returns_a_safe_tool_error_to_the_model_when_execution_fails(): void
    {
        [$orchestrator] = $this->orchestrator([
            self::toolResponse('toolu_update', 'test_probe', ['fail' => true]),
            self::textResponse('I could not update that task. Please confirm the task ID.'),
        ]);

        $result = $orchestrator->runSkill('secretary', 'test_assistance', self::messages());

        $this->assertDatabaseHas('secretary_logs', [
            'skill_name' => 'test_assistance',
            'status' => 'failed',
        ]);
        $this->assertSame('failed', $result['tool_executions'][0]['status']);
        $this->assertSame('I could not update that task. Please confirm the task ID.', $result['text']);
    }

    /** @return array{0: AIOrchestrator, 1: SequencedClaudeClient} */
    private function orchestrator(array $responses, ?PersonaLoader $personaLoader = null): array
    {
        $client = new SequencedClaudeClient($responses);

        return [
            new AIOrchestrator(
                $personaLoader ?? app(PersonaLoader::class),
                app(SkillLoader::class),
                app(SystemPromptBuilder::class),
                app(ClaudeToolSchemaConverter::class),
                $client,
                app(ToolRegistry::class),
                app(LogActionTool::class),
            ),
            $client,
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function messages(): array
    {
        return [['role' => 'user', 'content' => 'Please help with tasks.']];
    }

    /** @return array<string, mixed> */
    private static function textResponse(string $text): array
    {
        return [
            'text' => $text,
            'tool_uses' => [],
            'stop_reason' => 'end_turn',
            'raw' => ['content' => [['type' => 'text', 'text' => $text]]],
        ];
    }

    /** @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private static function toolResponse(string $id, string $name, array $input): array
    {
        return [
            'text' => '',
            'tool_uses' => [['id' => $id, 'name' => $name, 'input' => $input]],
            'stop_reason' => 'tool_use',
            'raw' => ['content' => [[
                'type' => 'tool_use',
                'id' => $id,
                'name' => $name,
                'input' => $input,
            ]]],
        ];
    }
}

class SequencedClaudeClient extends ClaudeClient
{
    /** @var list<array<string, mixed>> */
    public array $calls = [];

    /** @param list<array<string, mixed>> $responses */
    public function __construct(private array $responses) {}

    public function createMessage(string $system, array $messages, array $tools = []): array
    {
        $this->calls[] = compact('system', 'messages', 'tools');

        if ($this->responses === []) {
            throw new RuntimeException('Fake Claude client has no response left.');
        }

        return array_shift($this->responses);
    }
}
