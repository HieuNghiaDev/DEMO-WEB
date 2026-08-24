<?php

namespace App\Services;

use App\Contracts\AIModelClient;

class FakeClaudeClient implements AIModelClient
{
    public function createMessage(string $system, array $messages, array $tools = []): array
    {
        $toolResults = $this->latestToolResults($messages);

        if ($toolResults !== []) {
            return $this->toolResultResponse($toolResults);
        }

        $message = $this->latestUserText($messages);

        if ($this->isGreeting($message)) {
            return $this->textResponse('こんにちは。タスク管理をお手伝いします。');
        }

        $taskDeletionApprovalInput = $this->taskDeletionApprovalInput($message);

        if ($taskDeletionApprovalInput !== null && $this->hasTool($tools, 'request_approval')) {
            return $this->toolUseResponse(
                id: 'fake_tool_request_task_deletion',
                name: 'request_approval',
                input: $taskDeletionApprovalInput,
            );
        }

        $updateTaskInput = $this->updateTaskInput($message);

        if ($updateTaskInput !== null && $this->hasTool($tools, 'update_task')) {
            return $this->toolUseResponse(
                id: 'fake_tool_update_task',
                name: 'update_task',
                input: $updateTaskInput,
            );
        }

        if ($this->isCreateShortTaskRequest($message) && $this->hasTool($tools, 'create_task')) {
            return $this->toolUseResponse(
                id: 'fake_tool_create_task',
                name: 'create_task',
                input: [
                    'title' => $this->shortTaskTitle($message),
                    'horizon' => 'short',
                ],
            );
        }

        if ($this->isMorningBriefingRequest($message) && $this->hasTool($tools, 'list_tasks')) {
            return $this->toolUseResponse(
                id: 'fake_tool_morning_briefing',
                name: 'list_tasks',
                input: [],
            );
        }

        if ($this->isListTasksRequest($message) && $this->hasTool($tools, 'list_tasks')) {
            return $this->toolUseResponse(
                id: 'fake_tool_list_tasks',
                name: 'list_tasks',
                input: [],
            );
        }

        return $this->textResponse('ご依頼を確認しました。タスクについて具体的にお知らせください。');
    }

    /** @param list<array<string, mixed>> $messages
     * @return list<array<string, mixed>>
     */
    private function latestToolResults(array $messages): array
    {
        $lastMessage = $messages[array_key_last($messages)] ?? null;

        if (! is_array($lastMessage) || ($lastMessage['role'] ?? null) !== 'user' || ! is_array($lastMessage['content'] ?? null)) {
            return [];
        }

        return array_values(array_filter(
            $lastMessage['content'],
            fn (mixed $block): bool => is_array($block) && ($block['type'] ?? null) === 'tool_result',
        ));
    }

    /** @param list<array<string, mixed>> $messages */
    private function latestUserText(array $messages): string
    {
        foreach (array_reverse($messages) as $message) {
            if (($message['role'] ?? null) === 'user' && is_string($message['content'] ?? null)) {
                return trim($message['content']);
            }
        }

        return '';
    }

    private function isGreeting(string $message): bool
    {
        $normalized = mb_strtolower($message);

        return str_contains($message, 'こんにちは') || str_contains($normalized, 'hello');
    }

    private function isListTasksRequest(string $message): bool
    {
        return str_contains($message, '今日のタスクを見せて')
            || str_contains($message, 'タスク一覧を見せて')
            || str_contains($message, 'タスクを見せて');
    }

    private function isMorningBriefingRequest(string $message): bool
    {
        return trim($message) === '今日の朝会ブリーフィングをお願いします';
    }

    private function isCreateShortTaskRequest(string $message): bool
    {
        $normalized = mb_strtolower($message);

        return str_contains($normalized, 'create short task')
            || str_contains($normalized, 'add short task')
            || str_contains($message, '短期タスク')
            || str_contains($message, 'タスクを作成');
    }

    private function shortTaskTitle(string $message): string
    {
        if (preg_match('/(?:create|add)\s+(?:a\s+)?short\s+task\s*[:：-]?\s*(?<title>.+)$/i', $message, $matches)) {
            return trim($matches['title']);
        }

        return 'AIデモ短期タスク';
    }

    /** @param list<array<string, mixed>> $tools */
    private function hasTool(array $tools, string $name): bool
    {
        return in_array($name, array_column($tools, 'name'), true);
    }

    /** @param list<array<string, mixed>> $toolResults
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string, raw: array<string, mixed>}
     */
    private function toolResultResponse(array $toolResults): array
    {
        $result = $toolResults[0];
        $content = json_decode((string) ($result['content'] ?? ''), true);

        if (($result['tool_use_id'] ?? null) === 'fake_tool_morning_briefing') {
            return $this->textResponse($this->morningBriefingText(is_array($content) ? $content : []));
        }

        if (($result['tool_use_id'] ?? null) === 'fake_tool_list_tasks') {
            return $this->textResponse($this->listTasksText(is_array($content) ? $content : []));
        }

        if (($result['tool_use_id'] ?? null) === 'fake_tool_create_task') {
            $title = is_array($content) && is_string($content['title'] ?? null)
                ? $content['title']
                : '短期タスク';

            return $this->textResponse("短期タスク「{$title}」を作成しました。");
        }

        if (($result['tool_use_id'] ?? null) === 'fake_tool_update_task') {
            $taskId = is_array($content) && is_int($content['id'] ?? null)
                ? $content['id']
                : null;
            $title = is_array($content) && is_string($content['title'] ?? null)
                ? $content['title']
                : ($taskId === null ? 'タスク' : "Task {$taskId}");

            return $this->textResponse("タスク「{$title}」を完了に更新しました。");
        }

        if (($result['tool_use_id'] ?? null) === 'fake_tool_request_task_deletion') {
            $approvalId = is_array($content) && is_int($content['approval_id'] ?? null)
                ? $content['approval_id']
                : null;
            $approvalLabel = $approvalId === null ? '' : "（承認ID: {$approvalId}）";

            return $this->textResponse("タスク削除の承認を申請しました{$approvalLabel}。承認されるまで削除は実行されません。");
        }

        return $this->textResponse('ツールの実行結果を受け取りました。');
    }

    /** @return array{action_type: string, tool_name: string, payload: array{task_id: int}}|null */
    private function taskDeletionApprovalInput(string $message): ?array
    {
        if (preg_match('/^\s*(?:Task|タスク)\s*(?<id>\d+)\s*を削除して\s*[。.!！]?\s*$/iu', $message, $matches) !== 1) {
            return null;
        }

        $taskId = (int) $matches['id'];

        if ($taskId < 1) {
            return null;
        }

        return [
            'action_type' => 'delete_task',
            'tool_name' => 'delete_task',
            'payload' => ['task_id' => $taskId],
        ];
    }

    /** @return array{id: int, status: string}|null */
    private function updateTaskInput(string $message): ?array
    {
        $patterns = [
            '/^\s*(?:task|タスク)\s*(?<id>\d+)\s*(?:を\s*)?完了(?:\s*に\s*して|\s*して\s*ください|\s*してください)?\s*[。.!！]?\s*$/iu',
            '/^\s*(?<id>\d+)\s*番のタスク\s*を\s*完了(?:\s*に\s*して|\s*して\s*ください|\s*してください)?\s*[。.!！]?\s*$/u',
            '/^\s*(?:hoàn thành|hoàn tất)\s+task\s*(?<id>\d+)\s*[.!]?\s*$/iu',
            '/^\s*đánh dấu\s+task\s*(?<id>\d+)\s+(?:đã\s+)?hoàn thành\s*[.!]?\s*$/iu',
            '/^\s*task\s*(?<id>\d+)\s+đã\s+hoàn thành\s*[.!]?\s*$/iu',
            '/^\s*(?:complete|finish)\s+task\s*(?<id>\d+)\s*[.!]?\s*$/iu',
            '/^\s*mark\s+task\s*(?<id>\d+)\s+as\s+completed\s*[.!]?\s*$/iu',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $message, $matches) !== 1) {
                continue;
            }

            $taskId = (int) $matches['id'];

            if ($taskId < 1) {
                return null;
            }

            return [
                'id' => $taskId,
                'status' => 'completed',
            ];
        }

        return null;
    }

    /** @param list<array<string, mixed>> $tasks */
    private function listTasksText(array $tasks): string
    {
        if ($tasks === []) {
            return '現在、該当するタスクはありません。';
        }

        $titles = array_map(
            fn (array $task): string => '・'.($task['title'] ?? '無題のタスク'),
            $tasks,
        );

        return "現在のタスクです。\n".implode("\n", $titles);
    }

    /** @param list<array<string, mixed>> $tasks */
    private function morningBriefingText(array $tasks): string
    {
        $pendingTasks = array_values(array_filter(
            $tasks,
            fn (array $task): bool => ! $this->isCompletedTask($task),
        ));

        if ($pendingTasks === []) {
            return "おはようございます。今日の朝会ブリーフィングです。\n\n現在、対応が必要な未完了タスクはありません。";
        }

        usort($pendingTasks, function (array $left, array $right): int {
            $horizonOrder = ['short' => 0, 'mid' => 1, 'long' => 2];
            $leftHorizon = $horizonOrder[$left['horizon'] ?? ''] ?? 3;
            $rightHorizon = $horizonOrder[$right['horizon'] ?? ''] ?? 3;

            if ($leftHorizon !== $rightHorizon) {
                return $leftHorizon <=> $rightHorizon;
            }

            $leftDueDate = is_string($left['due_date'] ?? null) ? $left['due_date'] : '9999';
            $rightDueDate = is_string($right['due_date'] ?? null) ? $right['due_date'] : '9999';

            return $leftDueDate <=> $rightDueDate;
        });

        $tasksToShow = array_slice($pendingTasks, 0, 5);
        $taskLines = array_map(
            fn (array $task, int $index): string => $this->briefingTaskLine($task, $index + 1),
            $tasksToShow,
            array_keys($tasksToShow),
        );
        $priorityTitles = array_values(array_map(
            fn (array $task): string => (string) ($task['title'] ?? '無題のタスク'),
            array_filter($pendingTasks, fn (array $task): bool => ($task['horizon'] ?? null) === 'short'),
        ));
        $recommendedOrder = implode(' → ', array_map(
            fn (array $task): string => '「'.($task['title'] ?? '無題のタスク').'」',
            $tasksToShow,
        ));
        $briefing = "おはようございます。今日の朝会ブリーフィングです。\n\n";
        $briefing .= '【要対応】'.count($pendingTasks)."件\n".implode("\n", $taskLines);

        if (count($pendingTasks) > count($tasksToShow)) {
            $briefing .= "\n・ほか ".(count($pendingTasks) - count($tasksToShow)).'件';
        }

        if ($priorityTitles !== []) {
            $briefing .= "\n\n【優先タスク】\n・".implode("\n・", $priorityTitles);
        }

        return $briefing."\n\n【おすすめの順番】\n{$recommendedOrder}";
    }

    /** @param array<string, mixed> $task */
    private function isCompletedTask(array $task): bool
    {
        $status = is_string($task['status'] ?? null) ? mb_strtolower($task['status']) : '';

        return in_array($status, ['completed', 'complete', 'done'], true);
    }

    /** @param array<string, mixed> $task */
    private function briefingTaskLine(array $task, int $position): string
    {
        $title = is_string($task['title'] ?? null) ? $task['title'] : '無題のタスク';
        $status = is_string($task['status'] ?? null) ? $task['status'] : '要確認';
        $priority = ($task['horizon'] ?? null) === 'short' ? '【優先】' : '';
        $dueDate = is_string($task['due_date'] ?? null) && $task['due_date'] !== ''
            ? str_replace('-', '/', substr($task['due_date'], 0, 10))
            : '期限未設定';

        return "{$position}. {$priority}{$title}（期限: {$dueDate} / 状態: {$status}）";
    }

    /** @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string, raw: array<string, mixed>} */
    private function textResponse(string $text): array
    {
        return [
            'text' => $text,
            'tool_uses' => [],
            'stop_reason' => 'end_turn',
            'raw' => ['content' => [['type' => 'text', 'text' => $text]]],
        ];
    }

    /** @param array<string, mixed> $input
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string, raw: array<string, mixed>}
     */
    private function toolUseResponse(string $id, string $name, array $input): array
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
