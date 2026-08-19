<?php

namespace App\Services;

use App\AI\Tools\LogActionTool;
use App\Contracts\AIModelClient;
use RuntimeException;
use Throwable;

class AIOrchestrator
{
    public function __construct(
        private PersonaLoader $personaLoader,
        private SkillLoader $skillLoader,
        private SystemPromptBuilder $systemPromptBuilder,
        private ClaudeToolSchemaConverter $toolSchemaConverter,
        private AIModelClient $claudeClient,
        private ToolRegistry $toolRegistry,
        private LogActionTool $logActionTool,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  array{trigger_type?: string}  $triggerContext
     * @return array{text: string, persona: string, skill: string, tool_executions: list<array<string, mixed>>, stop_reason: string|null}
     */
    public function runSkill(
        string $personaName,
        string $skillName,
        array $messages,
        array $triggerContext = [],
    ): array {
        $persona = $this->personaLoader->load($personaName);

        if (! in_array($skillName, $persona['skills'], true)) {
            throw new RuntimeException("Persona [{$personaName}] does not allow skill [{$skillName}].");
        }

        $this->skillLoader->load($skillName);
        $systemPrompt = $this->systemPromptBuilder->build($personaName, $skillName);
        $tools = $this->toolSchemaConverter->forSkill($skillName);
        $triggerType = $triggerContext['trigger_type'] ?? 'chat';

        if (! is_string($triggerType) || $triggerType === '') {
            throw new RuntimeException('Trigger context requires a non-empty trigger_type.');
        }

        $maxIterations = (int) config('ai.orchestrator.max_iterations');

        if ($maxIterations < 1) {
            throw new RuntimeException('AI_ORCHESTRATOR_MAX_ITERATIONS must be at least 1.');
        }

        $history = $messages;
        $toolExecutions = [];
        $iterations = 0;

        while (true) {
            $response = $this->claudeClient->createMessage($systemPrompt, $history, $tools);
            $toolUses = $response['tool_uses'];

            if ($toolUses === []) {
                return [
                    'text' => $response['text'],
                    'persona' => $persona['name'],
                    'skill' => $skillName,
                    'tool_executions' => $toolExecutions,
                    'stop_reason' => $response['stop_reason'],
                ];
            }

            if ($iterations >= $maxIterations) {
                throw new RuntimeException("AI orchestrator exceeded the maximum of {$maxIterations} tool iterations.");
            }

            $assistantContent = $response['raw']['content'] ?? null;

            if (! is_array($assistantContent)) {
                throw new RuntimeException('Claude response with tool_use is missing assistant content.');
            }

            $history[] = [
                'role' => 'assistant',
                'content' => $assistantContent,
            ];

            $toolResults = [];

            foreach ($toolUses as $toolUse) {
                $toolResults[] = $this->executeToolUse(
                    toolUse: $toolUse,
                    allowedTools: $tools,
                    skillName: $skillName,
                    triggerType: $triggerType,
                    toolExecutions: $toolExecutions,
                );
            }

            $history[] = [
                'role' => 'user',
                'content' => $toolResults,
            ];
            $iterations++;
        }
    }

    /**
     * @param  array{id: string, name: string, input: array<string, mixed>}  $toolUse
     * @param  list<array{name: string, description: string, input_schema: array<string, mixed>}>  $allowedTools
     * @param  list<array<string, mixed>>  $toolExecutions
     * @return array{type: string, tool_use_id: string, content: string}
     */
    private function executeToolUse(
        array $toolUse,
        array $allowedTools,
        string $skillName,
        string $triggerType,
        array &$toolExecutions,
    ): array {
        $toolName = $toolUse['name'];

        if (! $this->toolRegistry->has($toolName)) {
            throw new RuntimeException("Claude requested unregistered tool [{$toolName}].");
        }

        if (! in_array($toolName, array_column($allowedTools, 'name'), true)) {
            throw new RuntimeException("Claude requested tool [{$toolName}] which is not allowed by skill [{$skillName}].");
        }

        try {
            $output = $this->toolRegistry->execute($toolName, $toolUse['input']);
            $this->logActionTool->execute([
                'skill_name' => $skillName,
                'trigger_type' => $triggerType,
                'input' => $toolUse['input'],
                'output' => $output,
                'status' => 'success',
            ]);
        } catch (Throwable $exception) {
            $this->logActionTool->execute([
                'skill_name' => $skillName,
                'trigger_type' => $triggerType,
                'input' => $toolUse['input'],
                'output' => ['error' => $exception->getMessage()],
                'status' => 'failed',
            ]);

            throw new RuntimeException("Tool [{$toolName}] execution failed: {$exception->getMessage()}", 0, $exception);
        }

        $toolExecutions[] = [
            'tool_use_id' => $toolUse['id'],
            'name' => $toolName,
            'input' => $toolUse['input'],
            'output' => $output,
            'status' => 'success',
        ];

        return [
            'type' => 'tool_result',
            'tool_use_id' => $toolUse['id'],
            'content' => json_encode($output, JSON_THROW_ON_ERROR),
        ];
    }
}
