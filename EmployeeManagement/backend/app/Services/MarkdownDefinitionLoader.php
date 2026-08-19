<?php

namespace App\Services;

use RuntimeException;

abstract class MarkdownDefinitionLoader
{
    /**
     * @return array{frontmatter: array<string, mixed>, instructions: string}
     */
    protected function readDefinition(string $directory, string $name, string $type): array
    {
        if (! preg_match('/^[A-Za-z0-9_-]+$/', $name)) {
            throw new RuntimeException("Invalid {$type} definition name [{$name}].");
        }

        $path = base_path("{$directory}/{$name}.md");

        if (! is_file($path)) {
            throw new RuntimeException("{$type} definition [{$name}] was not found.");
        }

        $contents = file_get_contents($path);

        if ($contents === false) {
            throw new RuntimeException("{$type} definition [{$name}] could not be read.");
        }

        if (! preg_match('/\A---\R(?<frontmatter>.*?)\R---\R?(?<instructions>.*)\z/s', $contents, $matches)) {
            throw new RuntimeException("{$type} definition [{$name}] has invalid frontmatter.");
        }

        return [
            'frontmatter' => $this->parseFrontmatter($matches['frontmatter'], $name, $type),
            'instructions' => trim($matches['instructions']),
        ];
    }

    /** @return array<string, mixed> */
    private function parseFrontmatter(string $frontmatter, string $name, string $type): array
    {
        $data = [];
        $listKey = null;

        foreach (preg_split('/\R/', $frontmatter) as $line) {
            if (trim($line) === '') {
                continue;
            }

            if (preg_match('/^\s*[-*]\s+(.+)$/', $line, $listMatch) && $listKey !== null) {
                $data[$listKey][] = $this->parseScalar($listMatch[1]);

                continue;
            }

            if (! preg_match('/^(?<key>[A-Za-z0-9_]+):(?:\s*(?<value>.*))?$/', $line, $keyMatch)) {
                throw new RuntimeException("{$type} definition [{$name}] has invalid frontmatter.");
            }

            $key = $keyMatch['key'];
            $value = trim($keyMatch['value'] ?? '');
            $listKey = null;

            if ($value === '') {
                $data[$key] = [];
                $listKey = $key;

                continue;
            }

            $data[$key] = $this->parseScalar($value);
        }

        return $data;
    }

    private function parseScalar(string $value): string
    {
        $value = trim($value);

        if (
            (str_starts_with($value, '"') && str_ends_with($value, '"'))
            || (str_starts_with($value, "'") && str_ends_with($value, "'"))
        ) {
            return substr($value, 1, -1);
        }

        return $value;
    }

    protected function requiredString(array $data, string $key, string $name, string $type): string
    {
        if (! isset($data[$key]) || ! is_string($data[$key]) || $data[$key] === '') {
            throw new RuntimeException("{$type} definition [{$name}] requires {$key}.");
        }

        return $data[$key];
    }

    /** @return list<string> */
    protected function requiredStringList(array $data, string $key, string $name, string $type): array
    {
        if (! isset($data[$key]) || ! is_array($data[$key]) || ! array_is_list($data[$key])) {
            throw new RuntimeException("{$type} definition [{$name}] requires a {$key} list.");
        }

        foreach ($data[$key] as $value) {
            if (! is_string($value) || $value === '') {
                throw new RuntimeException("{$type} definition [{$name}] requires a {$key} list.");
            }
        }

        return $data[$key];
    }
}
