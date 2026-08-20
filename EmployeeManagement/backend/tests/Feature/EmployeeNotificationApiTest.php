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

    public function test_employee_only_sees_and_marks_their_own_notifications(): void
    {
        $employee = User::factory()->create();
        $anotherEmployee = User::factory()->create();

        $mine = EmployeeNotification::query()->create([
            'user_id' => $employee->id,
            'kind' => 'info',
            'title' => '新しい業務が届きました',
            'message' => '契約書を確認してください。',
            'data' => ['assigned_task_id' => 101],
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
            ->assertJsonCount(1, 'notifications');

        $this->patchJson("/api/notifications/{$mine->id}/read")
            ->assertOk()
            ->assertJsonPath('notification.id', $mine->id);

        $this->assertNotNull($mine->fresh()->read_at);

        $this->patchJson("/api/notifications/{$theirs->id}/read")
            ->assertForbidden();
    }
}
