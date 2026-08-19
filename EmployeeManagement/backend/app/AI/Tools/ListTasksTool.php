<?php

namespace App\AI\Tools;

use App\Models\Task;
use Illuminate\Support\Facades\Validator;

class ListTasksTool implements Tool
{
    public function definition(): array
    {
        return [
            'name' => 'list_tasks',
            'description' => 'List tasks, optionally filtered by task fields and due date.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'horizon' => ['type' => 'string', 'enum' => ['short', 'mid', 'long']],
                    'status' => ['type' => 'string'],
                    'assigned_to' => ['type' => 'string'],
                    'matter_id' => ['type' => 'integer'],
                    'due_before' => ['type' => 'string', 'format' => 'date-time'],
                    'due_after' => ['type' => 'string', 'format' => 'date-time'],
                ],
            ],
        ];
    }

    public function execute(array $input): array
    {
        $filters = Validator::validate($input, [
            'horizon' => ['nullable', 'in:short,mid,long'],
            'status' => ['nullable', 'string', 'max:255'],
            'assigned_to' => ['nullable', 'string', 'max:255'],
            'matter_id' => ['nullable', 'integer', 'exists:matters,id'],
            'due_before' => ['nullable', 'date'],
            'due_after' => ['nullable', 'date'],
        ]);

        return Task::query()
            ->when($filters['horizon'] ?? null, fn ($query, $horizon) => $query->where('horizon', $horizon))
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($filters['assigned_to'] ?? null, fn ($query, $assignedTo) => $query->where('assigned_to', $assignedTo))
            ->when($filters['matter_id'] ?? null, fn ($query, $matterId) => $query->where('matter_id', $matterId))
            ->when($filters['due_before'] ?? null, fn ($query, $dueBefore) => $query->where('due_date', '<=', $dueBefore))
            ->when($filters['due_after'] ?? null, fn ($query, $dueAfter) => $query->where('due_date', '>=', $dueAfter))
            ->orderBy('id')
            ->get()
            ->map(fn (Task $task) => $this->serializeTask($task))
            ->all();
    }

    /** @return array<string, int|string|null> */
    protected function serializeTask(Task $task): array
    {
        return [
            'id' => $task->id,
            'title' => $task->title,
            'horizon' => $task->horizon,
            'due_date' => $task->due_date?->toISOString(),
            'status' => $task->status,
            'source' => $task->source,
            'assigned_to' => $task->assigned_to,
            'matter_id' => $task->matter_id,
        ];
    }
}
