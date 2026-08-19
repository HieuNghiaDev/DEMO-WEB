<?php

namespace App\AI\Tools;

use App\Models\ApprovalRequest;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class RequestApprovalTool implements Tool
{
    public function __construct(private LogActionTool $logActionTool) {}

    public function definition(): array
    {
        return [
            'name' => 'request_approval',
            'description' => 'Create a pending approval request before a consequential action is performed.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'action_type' => ['type' => 'string'],
                    'tool_name' => ['type' => ['string', 'null']],
                    'payload' => ['type' => ['object', 'null']],
                ],
                'required' => ['action_type'],
            ],
        ];
    }

    public function execute(array $input): array
    {
        $data = Validator::validate($input, [
            'action_type' => ['required', 'string', 'max:255'],
            'tool_name' => ['nullable', 'string', 'max:255'],
            'payload' => ['nullable'],
        ]);

        if (isset($data['payload']) && ! is_array($data['payload']) && ! is_object($data['payload'])) {
            throw ValidationException::withMessages([
                'payload' => ['The payload field must be an array or object.'],
            ]);
        }

        $approval = ApprovalRequest::create([
            ...$data,
            'payload' => $this->normalizePayload($data['payload'] ?? null),
            'status' => 'pending',
        ]);

        $result = [
            'approval_id' => $approval->id,
            'status' => $approval->status,
            'action_type' => $approval->action_type,
        ];

        $this->logActionTool->execute([
            'trigger_type' => 'tool',
            'input' => $input,
            'output' => $result,
            'status' => 'success',
        ]);

        return $result;
    }

    private function normalizePayload(mixed $payload): ?array
    {
        if ($payload === null) {
            return null;
        }

        if (is_array($payload)) {
            return $payload;
        }

        return json_decode(json_encode($payload, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    }
}
