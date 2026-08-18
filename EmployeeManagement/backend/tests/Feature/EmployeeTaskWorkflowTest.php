<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeTaskWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Employee $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);

        $this->employee = Employee::create([
            'employee_code' => 'TM001',
            'full_name' => 'LE HIEU NGHIA',
            'gender' => 'male',
            'hire_date' => '2026-08-18',
            'office_id' => $office->id,
            'status' => 'active',
        ]);
    }

    public function test_only_manager_or_admin_can_assign_tasks(): void
    {
        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $this->employee->id,
            'role' => 'employee',
        ]));

        $this->postJson("/api/employees/{$this->employee->id}/tasks", [
            'title' => '契約書の確認',
            'duration_minutes' => 60,
        ])
            ->assertForbidden()
            ->assertJsonPath('message', '業務を依頼する権限がありません。');
    }

    public function test_employee_can_confirm_start_and_complete_an_assigned_task(): void
    {
        $manager = User::factory()->create([
            'role' => 'manager',
        ]);
        Sanctum::actingAs($manager);

        $created = $this->postJson("/api/employees/{$this->employee->id}/tasks", [
            'title' => ' 契約書の確認 ',
            'description' => ' 内容を確認して報告してください。 ',
            'duration_minutes' => 60,
        ])
            ->assertCreated()
            ->assertJsonPath('task.status', 'pending')
            ->assertJsonPath('task.duration_minutes', 60)
            ->assertJsonPath('task.title', '契約書の確認');

        $taskId = $created->json('task.id');
        $employeeUser = User::factory()->create([
            'employee_id' => $this->employee->id,
            'role' => 'employee',
        ]);
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/my/tasks')
            ->assertOk()
            ->assertJsonCount(1, 'tasks')
            ->assertJsonPath('tasks.0.id', $taskId);

        $this->patchJson("/api/tasks/{$taskId}/accept")
            ->assertOk()
            ->assertJsonPath('task.status', 'accepted');

        $this->patchJson("/api/tasks/{$taskId}/status", [
            'status' => 'in_progress',
        ])
            ->assertOk()
            ->assertJsonPath('task.status', 'in_progress');

        $this->patchJson("/api/tasks/{$taskId}/status", [
            'status' => 'completed',
        ])
            ->assertOk()
            ->assertJsonPath('task.status', 'completed');

        $this->getJson('/api/my/tasks')
            ->assertOk()
            ->assertJsonCount(0, 'tasks');
    }
}
