<?php

namespace App\AI\Tools;

interface Tool
{
    /** @return array{name: string, description: string, input_schema: array<string, mixed>} */
    public function definition(): array;

    /** @return array<string, mixed>|list<array<string, mixed>> */
    public function execute(array $input): array;
}
