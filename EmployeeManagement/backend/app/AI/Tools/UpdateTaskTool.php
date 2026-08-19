<?php

namespace App\AI\Tools;

use App\Models\Task;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

class UpdateTaskTool extends ListTasksTool
{
    public function definition(): array
    {
        return [
            'name' => 'update_task',
            'description' => 'Update only the permitted fields of an existing task.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'integer'],
                    'title' => ['type' => 'string'],
                    'horizon' => ['type' => 'string', 'enum' => ['short', 'mid', 'long']],
                    'due_date' => ['type' => ['string', 'null'], 'format' => 'date-time'],
                    'status' => ['type' => 'string'],
                    'assigned_to' => ['type' => ['string', 'null']],
                    'matter_id' => ['type' => ['integer', 'null']],
                ],
                'required' => ['id'],
            ],
        ];
    }

    public function execute(array $input): array
    {
        $data = Validator::validate($input, [
            'id' => ['required', 'integer'],
            'title' => ['sometimes', 'string', 'max:255'],
            'horizon' => ['sometimes', 'in:short,mid,long'],
            'due_date' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', 'string', 'max:255'],
            'assigned_to' => ['sometimes', 'nullable', 'string', 'max:255'],
            'matter_id' => ['sometimes', 'nullable', 'integer', 'exists:matters,id'],
        ]);

        $task = Task::find($data['id']);

        if ($task === null) {
            throw new RuntimeException("Task [{$data['id']}] was not found.");
        }

        unset($data['id']);
        $task->update($data);

        return $this->serializeTask($task->fresh());
    }
}
