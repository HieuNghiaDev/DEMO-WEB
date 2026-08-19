<?php

namespace App\AI\Tools;

use App\Models\SecretaryLog;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class LogActionTool implements Tool
{
    public function definition(): array
    {
        return [
            'name' => 'log_action',
            'description' => 'Write an auditable action log for any AI skill.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'skill_name' => ['type' => ['string', 'null']],
                    'trigger_type' => ['type' => 'string'],
                    'input' => ['type' => ['object', 'null']],
                    'output' => ['type' => ['object', 'null']],
                    'status' => ['type' => 'string'],
                ],
                'required' => ['trigger_type', 'status'],
            ],
        ];
    }

    public function execute(array $input): array
    {
        $data = Validator::validate($input, [
            'skill_name' => ['nullable', 'string', 'max:255'],
            'trigger_type' => ['required', 'string', 'max:255'],
            'input' => ['nullable'],
            'output' => ['nullable'],
            'status' => ['required', 'string', 'max:255'],
        ]);

        foreach (['input', 'output'] as $field) {
            if (isset($data[$field]) && ! is_array($data[$field]) && ! is_object($data[$field])) {
                throw ValidationException::withMessages([
                    $field => ["The {$field} field must be an array or object."],
                ]);
            }
        }

        $log = SecretaryLog::create([
            ...$data,
            'input' => $this->normalizeJsonValue($data['input'] ?? null),
            'output' => $this->normalizeJsonValue($data['output'] ?? null),
        ]);

        return [
            'id' => $log->id,
            'skill_name' => $log->skill_name,
            'trigger_type' => $log->trigger_type,
            'input' => $log->input,
            'output' => $log->output,
            'status' => $log->status,
        ];
    }

    private function normalizeJsonValue(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }

        if (is_array($value)) {
            return $value;
        }

        return json_decode(json_encode($value, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    }
}
