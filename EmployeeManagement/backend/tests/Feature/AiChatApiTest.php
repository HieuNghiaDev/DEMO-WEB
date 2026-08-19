<?php

namespace Tests\Feature;

use App\Models\Persona;
use App\Models\User;
use App\Services\AIOrchestrator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class AiChatApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_chat_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/ai/chat', [
            'persona' => 'secretary',
            'skill' => 'task_management',
            'message' => '今日のタスクを見せて',
        ])->assertUnauthorized();
    }

    public function test_chat_endpoint_validates_the_message(): void
    {
        $this->actingAs(User::factory()->create(), 'sanctum')
            ->postJson('/api/ai/chat', [
                'persona' => 'secretary',
                'skill' => 'task_management',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('message');
    }

    public function test_chat_endpoint_rejects_an_inactive_persona(): void
    {
        $this->createPersona(active: false);

        $this->actingAs(User::factory()->create(), 'sanctum')
            ->postJson('/api/ai/chat', $this->requestPayload())
            ->assertForbidden()
            ->assertJsonPath('message', 'AI persona is not active.');
    }

    public function test_chat_endpoint_passes_the_validated_request_to_the_orchestrator(): void
    {
        $this->createPersona();
        $user = User::factory()->create(['role' => 'manager']);
        $orchestrator = Mockery::mock(AIOrchestrator::class);
        $orchestrator->shouldReceive('runSkill')
            ->once()
            ->withArgs(function (string $persona, string $skill, array $messages, array $context) use ($user): bool {
                return $persona === 'secretary'
                    && $skill === 'task_management'
                    && $messages === [['role' => 'user', 'content' => '今日のタスクを見せて']]
                    && $context === [
                        'trigger_type' => 'chat',
                        'user_id' => $user->id,
                        'role' => 'manager',
                    ];
            })
            ->andReturn([
                'persona' => 'secretary',
                'skill' => 'task_management',
                'text' => 'タスクはありません。',
                'tool_executions' => [[
                    'tool_use_id' => 'toolu_1',
                    'name' => 'list_tasks',
                    'status' => 'success',
                ]],
                'stop_reason' => 'end_turn',
            ]);
        $this->app->instance(AIOrchestrator::class, $orchestrator);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/chat', $this->requestPayload())
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'persona' => 'secretary',
                    'skill' => 'task_management',
                    'message' => 'タスクはありません。',
                    'tool_executions' => [[
                        'tool_use_id' => 'toolu_1',
                        'name' => 'list_tasks',
                        'status' => 'success',
                    ]],
                ],
            ]);
    }

    public function test_chat_endpoint_rejects_a_skill_not_allowed_by_the_persona_definition(): void
    {
        $this->createPersona();
        $orchestrator = Mockery::mock(AIOrchestrator::class);
        $orchestrator->shouldReceive('runSkill')
            ->once()
            ->andThrow(new RuntimeException('Persona [secretary] does not allow skill [task_management].'));
        $this->app->instance(AIOrchestrator::class, $orchestrator);

        $this->actingAs(User::factory()->create(), 'sanctum')
            ->postJson('/api/ai/chat', $this->requestPayload())
            ->assertUnprocessable()
            ->assertJsonPath('message', 'AI chat request could not be completed.');
    }

    public function test_chat_endpoint_hides_orchestrator_error_details(): void
    {
        $this->createPersona();
        $orchestrator = Mockery::mock(AIOrchestrator::class);
        $orchestrator->shouldReceive('runSkill')
            ->once()
            ->andThrow(new RuntimeException('ANTHROPIC_API_KEY=secret-value'));
        $this->app->instance(AIOrchestrator::class, $orchestrator);

        $response = $this->actingAs(User::factory()->create(), 'sanctum')
            ->postJson('/api/ai/chat', $this->requestPayload());

        $response
            ->assertUnprocessable()
            ->assertJsonPath('message', 'AI chat request could not be completed.')
            ->assertDontSee('secret-value');
    }

    private function createPersona(bool $active = true): Persona
    {
        return Persona::create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['task_management'],
            'active' => $active,
        ]);
    }

    /** @return array<string, string> */
    private function requestPayload(): array
    {
        return [
            'persona' => 'secretary',
            'skill' => 'task_management',
            'message' => '今日のタスクを見せて',
        ];
    }
}
