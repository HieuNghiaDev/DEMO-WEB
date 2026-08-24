<?php

namespace Tests\Feature;

use App\Contracts\AIModelClient;
use App\Models\ApprovalRequest;
use App\Models\Permission;
use App\Models\Persona;
use App\Models\Role;
use App\Models\SecretaryLog;
use App\Models\Task;
use App\Models\User;
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

    public function test_chat_api_lists_tasks_for_the_exact_browser_phrase(): void
    {
        config(['ai.fake_mode' => true]);
        Persona::create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['task_management'],
            'active' => true,
        ]);
        $task = Task::create([
            'title' => 'ブラウザ確認用タスク',
            'horizon' => 'short',
            'status' => 'pending',
            'source' => 'manual',
        ]);

        $this->actingAs($this->createAiUser(), 'sanctum')
            ->postJson('/api/ai/chat', [
                'persona' => 'secretary',
                'skill' => 'task_management',
                'message' => 'タスク一覧を見せて',
            ])
            ->assertOk()
            ->assertJsonPath('data.tool_executions.0.name', 'list_tasks')
            ->assertJsonPath('data.tool_executions.0.status', 'success')
            ->assertJsonPath('data.message', fn (string $message): bool => str_contains($message, $task->title));

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

    public function test_fake_mode_generates_a_morning_briefing_from_real_task_data(): void
    {
        config(['ai.fake_mode' => true]);
        Persona::create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['task_management', 'morning_briefing'],
            'active' => true,
        ]);
        $urgentTask = Task::create([
            'title' => '本日の申請書を確認',
            'horizon' => 'short',
            'due_date' => now()->addHour(),
            'status' => 'pending',
            'source' => 'manual',
        ]);
        $pendingTask = Task::create([
            'title' => '来週の面談資料を準備',
            'horizon' => 'mid',
            'due_date' => now()->addDays(3),
            'status' => 'in_progress',
            'source' => 'manual',
        ]);
        $completedTask = Task::create([
            'title' => '完了済みの請求書処理',
            'horizon' => 'short',
            'due_date' => now()->subDay(),
            'status' => 'completed',
            'source' => 'manual',
        ]);

        $response = $this->actingAs($this->createAiUser(), 'sanctum')
            ->postJson('/api/ai/chat', [
                'persona' => 'secretary',
                'skill' => 'morning_briefing',
                'message' => '今日の朝会ブリーフィングをお願いします',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.tool_executions.0.name', 'list_tasks')
            ->assertJsonPath('data.tool_executions.0.input', [])
            ->assertJsonPath('data.tool_executions.0.status', 'success')
            ->assertJsonCount(3, 'data.tool_executions.0.output')
            ->assertJsonPath('data.message', fn (string $message): bool => str_contains($message, $urgentTask->title)
                && str_contains($message, $pendingTask->title)
                && str_contains($message, '【優先】')
                && str_contains($message, '【おすすめの順番】')
                && ! str_contains($message, $completedTask->title));

        $log = SecretaryLog::query()->latest('id')->firstOrFail();
        $this->assertSame('morning_briefing', $log->skill_name);
        $this->assertSame('chat', $log->trigger_type);
        $this->assertSame('success', $log->status);
        $this->assertSame([], $log->input);
        $this->assertCount(3, $log->output);
        $this->assertContains($urgentTask->title, array_column($log->output, 'title'));
        $this->assertContains($completedTask->title, array_column($log->output, 'title'));
    }

    public function test_fake_mode_requests_human_approval_before_task_deletion(): void
    {
        config(['ai.fake_mode' => true]);
        Persona::create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['task_management'],
            'active' => true,
        ]);
        $task = Task::create([
            'title' => '削除前に承認が必要なタスク',
            'horizon' => 'short',
            'status' => 'pending',
            'source' => 'manual',
        ]);
        $user = $this->createAiUser();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/chat', [
                'persona' => 'secretary',
                'skill' => 'task_management',
                'message' => "Task {$task->id} を削除して",
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.tool_executions.0.name', 'request_approval')
            ->assertJsonPath('data.tool_executions.0.input.action_type', 'delete_task')
            ->assertJsonPath('data.tool_executions.0.input.tool_name', 'delete_task')
            ->assertJsonPath('data.tool_executions.0.input.payload.task_id', $task->id)
            ->assertJsonPath('data.tool_executions.0.output.status', 'pending')
            ->assertJsonPath('data.tool_executions.0.status', 'success')
            ->assertJsonPath('data.message', fn (string $message): bool => str_contains($message, '承認を申請しました')
                && str_contains($message, '削除は実行されません'));

        $approval = ApprovalRequest::query()->firstOrFail();
        $this->assertSame('delete_task', $approval->action_type);
        $this->assertSame('delete_task', $approval->tool_name);
        $this->assertSame(['task_id' => $task->id], $approval->payload);
        $this->assertSame($user->id, $approval->requested_by);
        $this->assertSame('pending', $approval->status);

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'title' => $task->title,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('secretary_logs', [
            'skill_name' => 'task_management',
            'trigger_type' => 'chat',
            'status' => 'success',
        ]);
    }

    public function test_fake_mode_updates_a_task_through_chat_and_records_the_execution(): void
    {
        config(['ai.fake_mode' => true]);
        Persona::create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['task_management'],
            'active' => true,
        ]);
        $task = Task::create([
            'title' => '資料確認',
            'horizon' => 'short',
            'status' => 'pending',
            'source' => 'manual',
        ]);
        $user = $this->createAiUser();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/chat', [
                'persona' => 'secretary',
                'skill' => 'task_management',
                'message' => "Task {$task->id} を完了にして",
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.message', 'タスク「資料確認」を完了に更新しました。')
            ->assertJsonPath('data.tool_executions.0.name', 'update_task')
            ->assertJsonPath('data.tool_executions.0.input.id', $task->id)
            ->assertJsonPath('data.tool_executions.0.input.status', 'completed')
            ->assertJsonPath('data.tool_executions.0.output.status', 'completed')
            ->assertJsonPath('data.tool_executions.0.status', 'success');

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'completed',
        ]);

        $log = SecretaryLog::query()->latest('id')->firstOrFail();
        $this->assertSame('task_management', $log->skill_name);
        $this->assertSame('chat', $log->trigger_type);
        $this->assertSame('success', $log->status);
        $this->assertSame(['id' => $task->id, 'status' => 'completed'], $log->input);
        $this->assertSame('completed', $log->output['status']);
    }

    public function test_fake_mode_recognizes_japanese_update_task_commands(): void
    {
        $this->assertUpdateTaskCommands([
            'タスク1を完了してください' => 1,
            'Task 1 を完了してください' => 1,
            'タスク1を完了にして' => 1,
            '1番のタスクを完了にして' => 1,
            'タスク 1 を完了' => 1,
            'Task 1 完了' => 1,
        ]);
    }

    public function test_fake_mode_recognizes_vietnamese_update_task_commands(): void
    {
        $this->assertUpdateTaskCommands([
            'Hoàn thành task 1' => 1,
            'Đánh dấu task 1 hoàn thành' => 1,
            'Task 1 đã hoàn thành' => 1,
            'Hoàn tất task 1' => 1,
        ]);
    }

    public function test_fake_mode_recognizes_english_update_task_commands_and_different_ids(): void
    {
        $this->assertUpdateTaskCommands([
            'Complete task 25' => 25,
            'Mark task 42 as completed' => 42,
            'Finish task 7' => 7,
        ]);
    }

    public function test_fake_mode_does_not_treat_unrelated_numbers_as_task_updates(): void
    {
        foreach ([
            '今日は2026年8月24日です',
            '資料を3部準備してください',
            'I need 2 documents',
        ] as $message) {
            $response = $this->fakeClientResponse($message);

            $this->assertSame([], $response['tool_uses'], $message);
            $this->assertSame('end_turn', $response['stop_reason'], $message);
        }
    }

    public function test_production_blocks_fake_mode(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['ai.fake_mode' => true]);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('AI_FAKE_MODE must not be enabled in production.');

        app(AIModelClient::class);
    }

    private function createAiUser(): User
    {
        $permission = Permission::create([
            'name' => 'ai.use',
            'display_name' => 'AIを利用',
        ]);
        $role = Role::create([
            'name' => 'test_ai_user',
            'display_name' => 'AI Test User',
        ]);
        $role->permissions()->sync([$permission->id]);

        $user = User::factory()->create();
        $user->roles()->sync([$role->id]);

        return $user;
    }

    /** @param array<string, int> $commands */
    private function assertUpdateTaskCommands(array $commands): void
    {
        foreach ($commands as $message => $taskId) {
            $response = $this->fakeClientResponse($message);

            $this->assertSame('tool_use', $response['stop_reason'], $message);
            $this->assertSame('update_task', $response['tool_uses'][0]['name'], $message);
            $this->assertSame([
                'id' => $taskId,
                'status' => 'completed',
            ], $response['tool_uses'][0]['input'], $message);
        }
    }

    /** @return array<string, mixed> */
    private function fakeClientResponse(string $message): array
    {
        return app(FakeClaudeClient::class)->createMessage(
            system: '',
            messages: [['role' => 'user', 'content' => $message]],
            tools: [['name' => 'update_task']],
        );
    }
}
