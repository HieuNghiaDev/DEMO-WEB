<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Persona;
use App\Services\AIOrchestrator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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

        try {
            $result = $this->orchestrator->runSkill(
                personaName: $validated['persona'],
                skillName: $validated['skill'],
                messages: [[
                    'role' => 'user',
                    'content' => $validated['message'],
                ]],
                triggerContext: [
                    'trigger_type' => 'chat',
                    'user_id' => $request->user()->id,
                    'role' => $request->user()->role,
                ],
            );
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
