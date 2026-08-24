<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SecretaryLog;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalManagementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_list_approvals(): void
    {
        $this->getJson('/api/approvals')->assertUnauthorized();
    }

    public function test_unauthenticated_user_cannot_process_an_approval(): void
    {
        $approval = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'status' => 'pending',
        ]);

        $this->patchJson("/api/approvals/{$approval->id}/approve")
            ->assertUnauthorized();
    }

    public function test_user_without_approval_permission_is_forbidden(): void
    {
        $this->actingAs(User::factory()->create(), 'sanctum')
            ->getJson('/api/approvals')
            ->assertForbidden();
    }

    public function test_user_with_view_permission_cannot_process_approvals(): void
    {
        $approval = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'status' => 'pending',
        ]);

        $this->actingAs($this->authorizedUser(['approval.view']), 'sanctum')
            ->patchJson("/api/approvals/{$approval->id}/approve")
            ->assertForbidden();
    }

    public function test_authorized_user_can_list_approvals(): void
    {
        $requester = User::factory()->create(['name' => 'Requester']);
        $approval = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'tool_name' => 'delete_task',
            'payload' => ['task_id' => 9],
            'requested_by' => $requester->id,
            'status' => 'pending',
        ]);

        $this->actingAs($this->authorizedUser(['approval.view']), 'sanctum')
            ->getJson('/api/approvals')
            ->assertOk()
            ->assertJsonPath('approvals.0.id', $approval->id)
            ->assertJsonPath('approvals.0.action_type', 'delete_task')
            ->assertJsonPath('approvals.0.payload.task_id', 9)
            ->assertJsonPath('approvals.0.requested_by.name', 'Requester')
            ->assertJsonPath('approvals.0.status', 'pending');
    }

    public function test_authorized_user_can_approve_a_pending_request_without_executing_delete_task(): void
    {
        $task = $this->createTask();
        $approval = $this->deleteTaskApproval($task);
        $approver = $this->authorizedUser(['approval.approve']);

        $this->actingAs($approver, 'sanctum')
            ->patchJson("/api/approvals/{$approval->id}/approve")
            ->assertOk()
            ->assertJsonPath('approval.status', 'approved')
            ->assertJsonPath('approval.approved_by.id', $approver->id);

        $this->assertDatabaseHas('approval_requests', [
            'id' => $approval->id,
            'status' => 'approved',
            'approved_by' => $approver->id,
        ]);
        $this->assertDatabaseHas('tasks', ['id' => $task->id]);
    }

    public function test_authorized_user_can_reject_a_pending_request(): void
    {
        $approval = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'status' => 'pending',
        ]);
        $reviewer = $this->authorizedUser(['approval.approve']);

        $this->actingAs($reviewer, 'sanctum')
            ->patchJson("/api/approvals/{$approval->id}/reject")
            ->assertOk()
            ->assertJsonPath('approval.status', 'rejected')
            ->assertJsonPath('approval.rejected_by.id', $reviewer->id);

        $this->assertDatabaseHas('approval_requests', [
            'id' => $approval->id,
            'status' => 'rejected',
            'rejected_by' => $reviewer->id,
        ]);
    }

    public function test_processed_requests_cannot_transition_again(): void
    {
        $reviewer = $this->authorizedUser(['approval.approve']);
        $approved = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'status' => 'approved',
        ]);
        $rejected = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'status' => 'rejected',
        ]);

        $this->actingAs($reviewer, 'sanctum')
            ->patchJson("/api/approvals/{$approved->id}/approve")
            ->assertStatus(409)
            ->assertJsonPath('current_status', 'approved');
        $this->actingAs($reviewer, 'sanctum')
            ->patchJson("/api/approvals/{$approved->id}/reject")
            ->assertStatus(409)
            ->assertJsonPath('current_status', 'approved');
        $this->actingAs($reviewer, 'sanctum')
            ->patchJson("/api/approvals/{$rejected->id}/approve")
            ->assertStatus(409)
            ->assertJsonPath('current_status', 'rejected');
    }

    public function test_approved_delete_task_can_be_executed_and_is_audited(): void
    {
        $task = $this->createTask();
        $approval = $this->deleteTaskApproval($task, 'approved');
        $executor = $this->authorizedUser(['approval.approve']);

        $this->actingAs($executor, 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute")
            ->assertOk()
            ->assertJsonPath('approval.executed_by.id', $executor->id)
            ->assertJsonPath('execution.approval_id', $approval->id)
            ->assertJsonPath('execution.action_type', 'delete_task')
            ->assertJsonPath('execution.task_id', $task->id);

        $this->assertDatabaseMissing('tasks', ['id' => $task->id]);
        $this->assertDatabaseHas('approval_requests', [
            'id' => $approval->id,
            'executed_by' => $executor->id,
        ]);

        $log = SecretaryLog::query()->where('trigger_type', 'approval_execution')->firstOrFail();
        $this->assertSame('success', $log->status);
        $this->assertSame($approval->id, $log->input['approval_id']);
        $this->assertSame($task->id, $log->input['task_id']);
        $this->assertSame($executor->id, $log->input['triggered_by']);
        $this->assertSame($task->id, $log->output['deleted_task']['id']);
    }

    public function test_pending_and_rejected_approvals_cannot_execute(): void
    {
        $executor = $this->authorizedUser(['approval.approve']);

        foreach (['pending', 'rejected'] as $status) {
            $task = $this->createTask("{$status} task");
            $approval = $this->deleteTaskApproval($task, $status);

            $this->actingAs($executor, 'sanctum')
                ->postJson("/api/approvals/{$approval->id}/execute")
                ->assertStatus(409);
            $this->assertDatabaseHas('tasks', ['id' => $task->id]);
        }
    }

    public function test_an_approval_cannot_execute_twice(): void
    {
        $task = $this->createTask();
        $approval = $this->deleteTaskApproval($task, 'approved');
        $executor = $this->authorizedUser(['approval.approve']);

        $this->actingAs($executor, 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute")
            ->assertOk();
        $this->actingAs($executor, 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute")
            ->assertStatus(409);

        $this->assertDatabaseCount('tasks', 0);
        $this->assertDatabaseCount('approval_requests', 1);
    }

    public function test_execution_uses_only_the_approved_task_id_and_ignores_override_input(): void
    {
        $approvedTask = $this->createTask('Approved task');
        $otherTask = $this->createTask('Other task');
        $approval = $this->deleteTaskApproval($approvedTask, 'approved');

        $this->actingAs($this->authorizedUser(['approval.approve']), 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute", [
                'task_id' => $otherTask->id,
            ])
            ->assertOk()
            ->assertJsonPath('execution.task_id', $approvedTask->id);

        $this->assertDatabaseMissing('tasks', ['id' => $approvedTask->id]);
        $this->assertDatabaseHas('tasks', ['id' => $otherTask->id]);
    }

    public function test_unsupported_action_cannot_execute(): void
    {
        $task = $this->createTask();
        $approval = ApprovalRequest::create([
            'action_type' => 'send_email',
            'tool_name' => 'send_email',
            'payload' => ['task_id' => $task->id],
            'status' => 'approved',
        ]);

        $this->actingAs($this->authorizedUser(['approval.approve']), 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute")
            ->assertUnprocessable();
        $this->assertDatabaseHas('tasks', ['id' => $task->id]);
    }

    public function test_missing_or_nonexistent_approved_task_is_handled_safely(): void
    {
        $executor = $this->authorizedUser(['approval.approve']);
        $missingPayload = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'tool_name' => 'delete_task',
            'payload' => [],
            'status' => 'approved',
        ]);
        $nonexistentTask = ApprovalRequest::create([
            'action_type' => 'delete_task',
            'tool_name' => 'delete_task',
            'payload' => ['task_id' => 999999],
            'status' => 'approved',
        ]);

        $this->actingAs($executor, 'sanctum')
            ->postJson("/api/approvals/{$missingPayload->id}/execute")
            ->assertUnprocessable();
        $this->actingAs($executor, 'sanctum')
            ->postJson("/api/approvals/{$nonexistentTask->id}/execute")
            ->assertNotFound();
    }

    public function test_execution_requires_authentication_and_approval_permission(): void
    {
        $task = $this->createTask();
        $approval = $this->deleteTaskApproval($task, 'approved');

        $this->postJson("/api/approvals/{$approval->id}/execute")
            ->assertUnauthorized();
        $this->actingAs($this->authorizedUser(['approval.view']), 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute")
            ->assertForbidden();

        $this->assertDatabaseHas('tasks', ['id' => $task->id]);
    }

    /** @param list<string> $permissions */
    private function authorizedUser(array $permissions): User
    {
        $role = Role::create([
            'name' => 'approval_test_'.str()->random(8),
            'display_name' => 'Approval Test',
        ]);
        $permissionIds = collect($permissions)->map(fn (string $name): int => Permission::query()
            ->firstOrCreate(['name' => $name], ['display_name' => $name])
            ->id);
        $role->permissions()->sync($permissionIds);

        $user = User::factory()->create();
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function createTask(string $title = 'Protected task'): Task
    {
        return Task::create([
            'title' => $title,
            'horizon' => 'short',
            'status' => 'pending',
            'source' => 'manual',
        ]);
    }

    private function deleteTaskApproval(Task $task, string $status = 'pending'): ApprovalRequest
    {
        return ApprovalRequest::create([
            'action_type' => 'delete_task',
            'tool_name' => 'delete_task',
            'payload' => ['task_id' => $task->id],
            'status' => $status,
        ]);
    }
}
