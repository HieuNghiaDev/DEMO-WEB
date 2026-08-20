<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeTask;
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
        Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->full_name,
            'work_date' => now()->toDateString(),
            'clock_in' => now(),
            'status' => 'working',
        ]);
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
            ->assertJsonPath('task.status', 'in_progress')
            ->assertJsonPath('task.work_session_id', 1)
            ->assertJsonPath('task.work_session.status', 'active')
            ->assertJsonPath(
                'task.work_session.task_description',
                '契約書の確認'
            );

        $this->assertDatabaseHas('work_sessions', [
            'id' => 1,
            'task_description' => '契約書の確認',
            'status' => 'active',
        ]);

        $this->patchJson("/api/tasks/{$taskId}/status", [
            'status' => 'completed',
        ])
            ->assertOk()
            ->assertJsonPath('task.status', 'completed');

        $this->assertDatabaseHas('work_sessions', [
            'id' => 1,
            'status' => 'completed',
        ]);

        $this->getJson('/api/my/tasks')
            ->assertOk()
            ->assertJsonCount(0, 'tasks');
    }

    public function test_manager_can_assign_a_task_with_note_and_specific_deadline(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'manager']));

        Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->full_name,
            'work_date' => now()->toDateString(),
            'clock_in' => now(),
            'status' => 'working',
        ]);

        $deadline = now()->addHours(3);

        $created = $this->postJson("/api/employees/{$this->employee->id}/tasks", [
            'title' => '契約書の確認',
            'description' => '条項A・B・Cを確認して報告してください。',
            'duration_minutes' => 60,
            // datetime-local submits the staff-selected local date and time.
            'due_at' => $deadline->format('Y-m-d\TH:i:s'),
        ])
            ->assertCreated()
            ->assertJsonPath('task.description', '条項A・B・Cを確認して報告してください。');

        $this->assertDatabaseHas('employee_tasks', [
            'employee_id' => $this->employee->id,
            'title' => '契約書の確認',
            'description' => '条項A・B・Cを確認して報告してください。',
        ]);

        $employeeUser = User::factory()->create([
            'employee_id' => $this->employee->id,
            'role' => 'employee',
        ]);
        Sanctum::actingAs($employeeUser);
        $taskId = $created->json('task.id');

        $this->patchJson("/api/tasks/{$taskId}/accept")->assertOk();
        Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->full_name,
            'work_date' => now()->toDateString(),
            'clock_in' => now(),
            'status' => 'working',
        ]);
        $this->patchJson("/api/tasks/{$taskId}/status", ['status' => 'in_progress'])
            ->assertOk();

        $task = EmployeeTask::query()->with('workSession')->findOrFail($taskId);
        $this->assertSame(
            $deadline->format('Y-m-d H:i:s'),
            $task->workSession->expected_end_at->format('Y-m-d H:i:s')
        );
    }

    public function test_manager_cannot_assign_a_task_to_an_offline_employee(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'manager']));

        $this->postJson("/api/employees/{$this->employee->id}/tasks", [
            'title' => '契約書の確認',
            'duration_minutes' => 60,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', '勤務中の社員にのみ業務を依頼できます。');
    }
}
