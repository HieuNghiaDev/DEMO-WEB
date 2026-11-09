<?php

namespace Tests\Feature;

use App\Models\EmployeeNotification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeNotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_center_counts_all_visible_unread_rows_and_paginates_without_crossing_users(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach (range(1, 23) as $index) {
            EmployeeNotification::create([
                'user_id' => $user->id, 'kind' => 'info', 'title' => "Notice {$index}", 'message' => 'Synthetic',
            ]);
        }
        $hidden = EmployeeNotification::create([
            'user_id' => $user->id, 'kind' => 'info', 'title' => 'Out of scope', 'message' => 'Synthetic',
            'data' => ['case_file_id' => 999999, 'target_path' => '/quests/999999'],
        ]);
        $foreign = EmployeeNotification::create([
            'user_id' => $other->id, 'kind' => 'info', 'title' => 'Other user', 'message' => 'Synthetic',
        ]);
        $this->getJson('/api/notifications/center')->assertUnauthorized();
        Sanctum::actingAs($user);
        $this->getJson('/api/notifications/center')->assertExactJson(['unread_count' => 23]);
        $first = $this->getJson('/api/notifications/center?details=1')->assertOk()
            ->assertJsonCount(20, 'notifications')->assertJsonPath('notifications.0.title', 'Notice 23')
            ->assertJsonPath('my_tasks_summary.items', []);
        $cursor = $first->json('next_before_id');
        $second = $this->getJson("/api/notifications/center?details=1&before_id={$cursor}")->assertOk()
            ->assertJsonCount(3, 'notifications')->assertJsonPath('notifications.0.title', 'Notice 3')
            ->assertJsonPath('next_before_id', null);
        $firstNotice = $second->json('notifications.0.id');
        $this->patchJson("/api/notifications/{$firstNotice}/read")->assertOk();
        $this->patchJson("/api/notifications/{$hidden->id}/read")->assertNotFound();
        $this->getJson('/api/notifications/center')->assertExactJson(['unread_count' => 22]);
        $this->patchJson('/api/notifications/read-all')->assertOk();
        $this->getJson('/api/notifications/center')->assertExactJson(['unread_count' => 0]);
        $this->assertNull($hidden->fresh()->read_at);
        $this->assertNull($foreign->fresh()->read_at);
    }

    public function test_employee_only_sees_and_marks_their_own_notifications(): void
    {
        $employee = User::factory()->create();
        $anotherEmployee = User::factory()->create();

        $mine = EmployeeNotification::query()->create([
            'user_id' => $employee->id,
            'kind' => 'info',
            'title' => '新しい業務が届きました',
            'message' => '契約書を確認してください。',
            'data' => [
                'assigned_task_id' => 101,
                'approval_id' => 12,
                'action_type' => 'delete_task',
                'target_path' => '/approvals',
            ],
        ]);

        $theirs = EmployeeNotification::query()->create([
            'user_id' => $anotherEmployee->id,
            'kind' => 'info',
            'title' => '別の社員向け',
            'message' => 'この通知は表示されません。',
        ]);

        Sanctum::actingAs($employee);

        $this->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('notifications.0.id', $mine->id)
            ->assertJsonPath('notifications.0.assigned_task_id', 101)
            ->assertJsonPath('notifications.0.approval_id', 12)
            ->assertJsonPath('notifications.0.action_type', 'delete_task')
            ->assertJsonPath('notifications.0.target_path', '/approvals')
            ->assertJsonCount(1, 'notifications');

        $this->patchJson("/api/notifications/{$mine->id}/read")
            ->assertOk()
            ->assertJsonPath('notification.id', $mine->id);

        $this->assertNotNull($mine->fresh()->read_at);

        $this->patchJson("/api/notifications/{$theirs->id}/read")
            ->assertForbidden();
    }
}
