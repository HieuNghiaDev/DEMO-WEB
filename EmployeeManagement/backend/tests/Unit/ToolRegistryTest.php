<?php

namespace Tests\Unit;

use App\Models\SecretaryLog;
use App\Models\Task;
use App\Services\SkillLoader;
use App\Services\ToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Tests\TestCase;

class ToolRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_registers_tools_declared_by_task_management(): void
    {
        $registry = app(ToolRegistry::class);
        $skill = app(SkillLoader::class)->load('task_management');

        foreach ($skill['tools'] as $toolName) {
            $this->assertTrue($registry->has($toolName));
        }

        $this->assertSame('list_tasks', $registry->get('list_tasks')['name']);
    }

    public function test_it_reports_an_unregistered_tool(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Tool [missing] is not registered.');

        app(ToolRegistry::class)->execute('missing');
    }

    public function test_list_tasks_returns_structured_tasks_and_filters_horizon(): void
    {
        Task::create([
            'title' => 'Urgent task', 'horizon' => 'short', 'status' => 'pending', 'source' => 'manual',
        ]);
        Task::create([
            'title' => 'Later task', 'horizon' => 'long', 'status' => 'pending', 'source' => 'manual',
        ]);

        $tasks = app(ToolRegistry::class)->execute('list_tasks', ['horizon' => 'short']);

        $this->assertCount(1, $tasks);
        $this->assertSame('Urgent task', $tasks[0]['title']);
        $this->assertSame('short', $tasks[0]['horizon']);
    }

    public function test_create_task_defaults_source_to_ai_generated(): void
    {
        $task = app(ToolRegistry::class)->execute('create_task', [
            'title' => 'Prepare filing',
            'horizon' => 'mid',
        ]);

        $this->assertSame('ai_generated', $task['source']);
        $this->assertDatabaseHas('tasks', ['id' => $task['id'], 'source' => 'ai_generated']);
    }

    public function test_create_task_rejects_an_invalid_horizon(): void
    {
        $this->expectException(ValidationException::class);

        app(ToolRegistry::class)->execute('create_task', [
            'title' => 'Invalid horizon task',
            'horizon' => 'urgent',
        ]);
    }

    public function test_update_task_updates_only_permitted_task_fields(): void
    {
        $task = Task::create([
            'title' => 'Initial title', 'horizon' => 'short', 'status' => 'pending', 'source' => 'manual',
        ]);

        $updated = app(ToolRegistry::class)->execute('update_task', [
            'id' => $task->id,
            'title' => 'Updated title',
            'horizon' => 'long',
        ]);

        $this->assertSame('Updated title', $updated['title']);
        $this->assertSame('long', $updated['horizon']);
        $this->assertSame('manual', $updated['source']);
    }

    public function test_update_task_reports_a_missing_task(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Task [999] was not found.');

        app(ToolRegistry::class)->execute('update_task', ['id' => 999]);
    }

    public function test_log_action_writes_a_secretary_log(): void
    {
        $log = app(ToolRegistry::class)->execute('log_action', [
            'skill_name' => 'task_management',
            'trigger_type' => 'chat',
            'input' => ['title' => 'Prepare filing'],
            'output' => ['task_id' => 1],
            'status' => 'success',
        ]);

        $this->assertSame('task_management', $log['skill_name']);
        $this->assertDatabaseHas('secretary_logs', [
            'id' => $log['id'],
            'trigger_type' => 'chat',
            'status' => 'success',
        ]);
        $this->assertSame(['task_id' => 1], SecretaryLog::findOrFail($log['id'])->output);
    }
}
