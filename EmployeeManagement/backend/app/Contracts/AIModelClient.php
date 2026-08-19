<?php

namespace App\Contracts;

interface AIModelClient
{
    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array{name: string, description: string, input_schema: array<string, mixed>}>  $tools
     * @return array{text: string, tool_uses: list<array{id: string, name: string, input: array<string, mixed>}>, stop_reason: string|null, raw: array<string, mixed>}
     */
    public function createMessage(string $system, array $messages, array $tools = []): array;
}
