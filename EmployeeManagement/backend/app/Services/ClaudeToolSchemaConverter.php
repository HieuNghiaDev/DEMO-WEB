<?php

namespace App\Services;

use RuntimeException;

class ClaudeToolSchemaConverter
{
    public function __construct(
        private ToolRegistry $toolRegistry,
        private SkillLoader $skillLoader,
    ) {}

    /** @return list<array{name: string, description: string, input_schema: array<string, mixed>}> */
    public function forSkill(string $skillName): array
    {
        $skill = $this->skillLoader->load($skillName);

        return $this->forToolNames($skill['tools']);
    }

    /** @param list<string> $toolNames
     * @return list<array{name: string, description: string, input_schema: array<string, mixed>}>
     */
    public function forToolNames(array $toolNames): array
    {
        return array_map(function (string $toolName): array {
            if (! $this->toolRegistry->has($toolName)) {
                throw new RuntimeException("Skill declares unregistered tool [{$toolName}].");
            }

            return $this->convert($this->toolRegistry->get($toolName));
        }, $toolNames);
    }

    /** @param array{name: string, description: string, input_schema: array<string, mixed>} $metadata
     * @return array{name: string, description: string, input_schema: array<string, mixed>}
     */
    public function convert(array $metadata): array
    {
        return [
            'name' => $metadata['name'],
            'description' => $metadata['description'],
            'input_schema' => $metadata['input_schema'],
        ];
    }
}
