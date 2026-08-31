<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\EmployeeNotification;
use App\Models\Permission;
use App\Models\Persona;
use App\Models\Role;
use App\Models\User;
use App\Services\ApprovalNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\AiTestDefinitions;
use Tests\TestCase;

class ApprovalNotificationTest extends TestCase
{
    use AiTestDefinitions;
    use RefreshDatabase;

    public function test_ai_approval_request_notifies_only_active_approval_managers(): void
    {
        config([
            'ai.provider' => 'gemini',
            'gemini.api_key' => 'test-gemini-key',
            'gemini.model' => 'test-gemini-model',
            'gemini.fallback_model' => null,
        ]);
        Persona::query()->create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['test_assistance'],
            'active' => true,
        ]);

        $requester = $this->userWithPermission('ai.use', 'AI Requester');
        $approver = $this->userWithPermission('approval.approve', 'Approval Manager');
        $viewer = $this->userWithPermission('approval.view', 'Approval Viewer');
        $inactiveApprover = $this->userWithPermission(
            'approval.approve',
            'Inactive Manager',
            false,
        );
        $ordinaryUser = User::factory()->create(['is_active' => true]);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push([
                    'candidates' => [[
                        'content' => ['parts' => [[
                            'functionCall' => [
                                'id' => 'approval_call_1',
                                'name' => 'request_approval',
                                'args' => [
                                    'action_type' => 'send_email',
                                    'tool_name' => 'send_email',
                                    'payload' => ['subject' => 'Test approval'],
                                ],
                            ],
                        ]]],
                        'finishReason' => 'STOP',
                    ]],
                ])
                ->push([
                    'candidates' => [[
                        'content' => ['parts' => [['text' => '承認を申請しました。']]],
                        'finishReason' => 'STOP',
                    ]],
                ]),
        ]);

        $response = $this->actingAs($requester, 'sanctum')
            ->postJson('/api/ai/chat', [
                'persona' => 'secretary',
                'skill' => 'test_assistance',
                'message' => '承認を申請してください',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.tool_executions.0.name', 'request_approval')
            ->assertJsonPath('data.tool_executions.0.output.status', 'pending');

        $approval = ApprovalRequest::query()->sole();
        $notification = EmployeeNotification::query()
            ->where('user_id', $approver->id)
            ->sole();

        $this->assertSame('pending', $approval->status);
        $this->assertSame('warning', $notification->kind);
        $this->assertSame('承認待ちの申請があります', $notification->title);
        $this->assertStringContainsString('send_email', $notification->message);
        $this->assertSame($approval->id, $notification->data['approval_id']);
        $this->assertSame('send_email', $notification->data['action_type']);
        $this->assertSame($requester->id, $notification->data['requester_id']);
        $this->assertSame('/approvals', $notification->data['target_path']);
        $this->assertNull($notification->read_at);

        $this->assertFalse(EmployeeNotification::query()->whereIn('user_id', [
            $requester->id,
            $viewer->id,
            $inactiveApprover->id,
            $ordinaryUser->id,
        ])->exists());
        $this->assertDatabaseHas('secretary_logs', [
            'skill_name' => 'test_assistance',
            'trigger_type' => 'chat',
            'status' => 'success',
        ]);
    }

    public function test_approval_notification_is_not_duplicated_for_the_same_recipient(): void
    {
        $approver = $this->userWithPermission('approval.approve', 'Approval Manager');
        $approval = ApprovalRequest::query()->create([
            'action_type' => 'send_email',
            'tool_name' => 'send_email',
            'payload' => ['task_id' => 99],
            'status' => 'pending',
        ]);
        $service = app(ApprovalNotificationService::class);

        $this->assertSame(1, $service->notify($approval));
        $this->assertSame(0, $service->notify($approval));

        $this->assertSame(1, EmployeeNotification::query()
            ->where('user_id', $approver->id)
            ->where('data->approval_id', $approval->id)
            ->count());
    }

    private function userWithPermission(
        string $permissionName,
        string $name,
        bool $isActive = true,
    ): User {
        $permission = Permission::query()->firstOrCreate(
            ['name' => $permissionName],
            ['display_name' => $permissionName],
        );
        $role = Role::query()->create([
            'name' => 'notification_test_'.str()->random(10),
            'display_name' => 'Notification Test',
        ]);
        $role->permissions()->sync([$permission->id]);

        $user = User::factory()->create([
            'name' => $name,
            'is_active' => $isActive,
        ]);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
