<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Persona;
use App\Services\AIOrchestrator;
use App\Services\AiProviderBusyException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use RuntimeException;
use Throwable;

class AiChatController extends Controller
{
    public function __construct(private AIOrchestrator $orchestrator) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'persona' => ['required', 'string', 'max:255'],
            'skill' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string', 'max:4000'],
            'messages' => ['sometimes', 'array', 'max:20'],
            'messages.*' => ['required', 'array:role,content'],
            'messages.*.role' => ['required', 'string', Rule::in(['user', 'assistant'])],
            'messages.*.content' => ['required', 'string', 'max:4000'],
            'context' => ['sometimes', 'array:page,case_id,approval_id', 'min:1'],
            'context.page' => [
                'required_with:context',
                'string',
                Rule::in([
                    'employee_room',
                    'organization',
                    'business_quest',
                    'manual_workshop',
                    'ai_workspace',
                    'approvals',
                ]),
            ],
            'context.case_id' => [
                'sometimes',
                'integer',
                'min:1',
                'prohibited_unless:context.page,business_quest',
            ],
            'context.approval_id' => [
                'sometimes',
                'integer',
                'min:1',
                'prohibited_unless:context.page,approvals',
            ],
        ]);

        $persona = Persona::query()
            ->where('name', $validated['persona'])
            ->first();

        if ($persona === null) {
            return response()->json([
                'message' => 'AI persona was not found.',
            ], 404);
        }

        if (! $persona->active) {
            return response()->json([
                'message' => 'AI persona is not active.',
            ], 403);
        }

        $messages = $validated['messages'] ?? [];
        $messages[] = [
            'role' => 'user',
            'content' => $validated['message'],
        ];

        try {
            $triggerContext = [
                'trigger_type' => 'chat',
                'user_id' => $request->user()->id,
                'role' => $request->user()->role,
            ];

            if (isset($validated['context'])) {
                $triggerContext['page_context'] = $validated['context'];
            }

            $result = $this->orchestrator->runSkill(
                personaName: $validated['persona'],
                skillName: $validated['skill'],
                messages: $messages,
                triggerContext: $triggerContext,
            );
        } catch (AiProviderBusyException|RequestException|ConnectionException $exception) {
            Log::warning('AI provider is temporarily unavailable.', [
                'exception_class' => $exception::class,
            ]);

            return response()->json([
                'message' => 'AI provider is busy. Please try again shortly.',
                'code' => 'ai_provider_unavailable',
            ], 503);
        } catch (RuntimeException $exception) {
            Log::warning('AI chat orchestration request failed.', [
                'exception_class' => $exception::class,
            ]);

            return response()->json([
                'message' => 'AI chat request could not be completed.',
            ], 422);
        } catch (Throwable $exception) {
            Log::error('AI chat service request failed.', [
                'exception_class' => $exception::class,
            ]);

            return response()->json([
                'message' => 'AI service is temporarily unavailable.',
            ], 502);
        }

        return response()->json([
            'data' => [
                'persona' => $result['persona'],
                'skill' => $result['skill'],
                'message' => $result['text'],
                'tool_executions' => $result['tool_executions'],
            ],
        ]);
    }
}
