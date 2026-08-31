<?php

namespace Tests\Unit;

use App\Models\SecretaryLog;
use App\Services\ToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class ToolRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_infrastructure_tools_remain(): void
    {
        $registry = app(ToolRegistry::class);
        foreach (['list_tasks', 'create_task', 'update_task', 'delete_task'] as $tool) {
            $this->assertFalse($registry->has($tool));
        }
        $this->assertTrue($registry->has('log_action'));
        $this->assertTrue($registry->has('request_approval'));
    }

    public function test_it_reports_an_unregistered_tool(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Tool [missing] is not registered.');

        app(ToolRegistry::class)->execute('missing');
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
