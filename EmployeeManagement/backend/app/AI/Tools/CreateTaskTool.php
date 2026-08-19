<?php

namespace App\AI\Tools;

use App\Models\Task;
use Illuminate\Support\Facades\Validator;

class CreateTaskTool extends ListTasksTool
{
    public function definition(): array
    {
        return [
            'name' => 'create_task',
            'description' => 'Create a task from explicitly supplied task details.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string'],
                    'horizon' => ['type' => 'string', 'enum' => ['short', 'mid', 'long']],
                    'due_date' => ['type' => ['string', 'null'], 'format' => 'date-time'],
                    'matter_id' => ['type' => ['integer', 'null']],
                    'assigned_to' => ['type' => ['string', 'null']],
                    'source' => ['type' => 'string', 'enum' => ['manual', 'ai_generated']],
                ],
                'required' => ['title', 'horizon'],
            ],
        ];
    }

    public function execute(array $input): array
    {
        $data = Validator::validate($input, [
            'title' => ['required', 'string', 'max:255'],
            'horizon' => ['required', 'in:short,mid,long'],
            'due_date' => ['nullable', 'date'],
            'matter_id' => ['nullable', 'integer', 'exists:matters,id'],
            'assigned_to' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'in:manual,ai_generated'],
        ]);

        $task = Task::create([
            ...$data,
            'source' => $data['source'] ?? 'ai_generated',
            'status' => 'pending',
        ]);

        return $this->serializeTask($task);
    }
}
