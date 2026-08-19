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
        return str_contains($message, '今日のタスクを見せて') || str_contains($message, 'タスクを見せて');
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

        if (($result['tool_use_id'] ?? null) === 'fake_tool_list_tasks') {
            return $this->textResponse($this->listTasksText(is_array($content) ? $content : []));
        }

        if (($result['tool_use_id'] ?? null) === 'fake_tool_create_task') {
            $title = is_array($content) && is_string($content['title'] ?? null)
                ? $content['title']
                : '短期タスク';

            return $this->textResponse("短期タスク「{$title}」を作成しました。");
        }

        return $this->textResponse('ツールの実行結果を受け取りました。');
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
