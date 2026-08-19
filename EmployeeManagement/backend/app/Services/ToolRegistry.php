<?php

namespace App\Services;

use App\AI\Tools\CreateTaskTool;
use App\AI\Tools\ListTasksTool;
use App\AI\Tools\LogActionTool;
use App\AI\Tools\RequestApprovalTool;
use App\AI\Tools\Tool;
use App\AI\Tools\UpdateTaskTool;
use RuntimeException;

class ToolRegistry
{
    /** @var array<string, Tool> */
    private array $tools = [];

    public function __construct(
        ListTasksTool $listTasksTool,
        CreateTaskTool $createTaskTool,
        UpdateTaskTool $updateTaskTool,
        LogActionTool $logActionTool,
        RequestApprovalTool $requestApprovalTool,
    ) {
        foreach ([$listTasksTool, $createTaskTool, $updateTaskTool, $logActionTool, $requestApprovalTool] as $tool) {
            $this->register($tool);
        }
    }

    public function register(Tool $tool): void
    {
        $this->tools[$tool->definition()['name']] = $tool;
    }

    public function has(string $name): bool
    {
        return isset($this->tools[$name]);
    }

    /** @return array{name: string, description: string, input_schema: array<string, mixed>} */
    public function get(string $name): array
    {
        return $this->tool($name)->definition();
    }

    /** @return array<string, mixed>|list<array<string, mixed>> */
    public function execute(string $name, array $input = []): array
    {
        return $this->tool($name)->execute($input);
    }

    private function tool(string $name): Tool
    {
        if (! $this->has($name)) {
            throw new RuntimeException("Tool [{$name}] is not registered.");
        }

        return $this->tools[$name];
    }
}
