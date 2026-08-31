<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\CaseFile;
use App\Models\Client;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
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
        $approval = ApprovalRequest::create(['action_type' => 'review_document', 'status' => 'pending']);
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

    public function test_legacy_execution_is_gone_for_every_state_without_touching_v2_tasks(): void
    {
        $this->artisan('themis:v2-cleanup-legacy', ['--confirm-local' => true])->assertExitCode(0);
        $client = Client::create(['name' => 'V2 client']);
        $case = CaseFile::create(['title' => 'V2 case', 'client_id' => $client->id]);
        $task = $case->caseTasks()->create(['title' => 'Keep canonical task']);
        $executor = $this->authorizedUser(['approval.approve']);
        foreach (['pending', 'approved', 'rejected'] as $status) {
            $approval = ApprovalRequest::create([
                'action_type' => 'delete_task', 'tool_name' => 'delete_task',
                'payload' => ['task_id' => $task->id], 'status' => $status,
            ]);
            $this->actingAs($executor, 'sanctum')
                ->postJson("/api/approvals/{$approval->id}/execute", ['task_id' => $task->id])
                ->assertStatus(410)->assertJsonPath('code', 'legacy_execution_unavailable');
            $this->assertNull($approval->fresh()->executed_at);
        }
        $this->assertDatabaseHas('case_tasks', ['id' => $task->id]);
        $this->assertFalse(Schema::hasTable('tasks'));
        $this->assertFalse(Schema::hasTable('matters'));
    }

    public function test_execution_requires_authentication_and_approval_permission(): void
    {
        $approval = ApprovalRequest::create(['action_type' => 'delete_task', 'status' => 'approved']);
        $this->postJson("/api/approvals/{$approval->id}/execute")->assertUnauthorized();
        $this->actingAs($this->authorizedUser(['approval.view']), 'sanctum')
            ->postJson("/api/approvals/{$approval->id}/execute")->assertForbidden();
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
}
