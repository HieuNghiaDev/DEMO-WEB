<?php

namespace Tests\Feature;

use App\Contracts\AIModelClient;
use App\Models\Task;
use App\Services\AIOrchestrator;
use App\Services\ClaudeClient;
use App\Services\FakeClaudeClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Tests\TestCase;

class FakeAiModeTest extends TestCase
{
    use RefreshDatabase;

    public function test_fake_mode_binds_the_fake_client(): void
    {
        config(['ai.fake_mode' => true]);

        $this->assertInstanceOf(FakeClaudeClient::class, app(AIModelClient::class));
    }

    public function test_real_mode_binds_the_claude_client(): void
    {
        config(['ai.fake_mode' => false]);

        $this->assertInstanceOf(ClaudeClient::class, app(AIModelClient::class));
    }

    public function test_fake_mode_lists_tasks_through_the_orchestrator_and_tool_registry(): void
    {
        config(['ai.fake_mode' => true]);
        Task::create([
            'title' => 'DEMO TASK: Today task',
            'horizon' => 'short',
            'status' => 'pending',
            'source' => 'manual',
        ]);

        $result = app(AIOrchestrator::class)->runSkill(
            personaName: 'secretary',
            skillName: 'task_management',
            messages: [['role' => 'user', 'content' => '今日のタスクを見せて']],
        );

        $this->assertStringContainsString('DEMO TASK: Today task', $result['text']);
        $this->assertSame('list_tasks', $result['tool_executions'][0]['name']);
        $this->assertDatabaseHas('secretary_logs', [
            'skill_name' => 'task_management',
            'trigger_type' => 'chat',
            'status' => 'success',
        ]);
    }

    public function test_fake_mode_creates_a_short_task_through_the_orchestrator_and_tool_registry(): void
    {
        config(['ai.fake_mode' => true]);

        $result = app(AIOrchestrator::class)->runSkill(
            personaName: 'secretary',
            skillName: 'task_management',
            messages: [['role' => 'user', 'content' => 'Create short task: Follow up demo client']],
        );

        $this->assertSame('create_task', $result['tool_executions'][0]['name']);
        $this->assertStringContainsString('Follow up demo client', $result['text']);
        $this->assertDatabaseHas('tasks', [
            'title' => 'Follow up demo client',
            'horizon' => 'short',
            'source' => 'ai_generated',
        ]);
    }

    public function test_production_blocks_fake_mode(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['ai.fake_mode' => true]);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('AI_FAKE_MODE must not be enabled in production.');

        app(AIModelClient::class);
    }
}
