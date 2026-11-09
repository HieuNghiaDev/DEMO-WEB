<?php

namespace Tests\Feature;

use App\AI\Tools\QueryCaseTasksTool;
use App\Models\Attendance;
use App\Models\CaseActivity;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\Client;
use App\Models\Employee;
use App\Models\EmployeeTask;
use App\Models\Office;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkSession;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Database\Seeders\TaskVisibilityPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class TaskVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private User $normal;

    private User $manager;

    private User $admin;

    private Employee $a;

    private Employee $b;

    private CaseFile $case;

    private CaseDocument $ownDocument;

    private CaseDocument $privateDocument;

    private CaseTask $own;

    private CaseTask $other;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 7)->setTime(10, 0));
        $this->seed(RolePermissionSeeder::class);
        $office = Office::create(['office_code' => 'PRIVATE', 'name' => 'Privacy Test', 'status' => 'active']);
        $employees = collect(['Sentinel', 'Employee A', 'Employee B', 'Administrator'])->map(fn ($name, $i) => Employee::create([
            'employee_code' => 'PRIVATE-'.$i, 'full_name' => $name, 'office_id' => $office->id,
            'employment_type' => 'full_time', 'hire_date' => '2026-01-01', 'status' => 'active',
        ]));
        $this->a = $employees[1];
        $this->b = $employees[2];
        $this->normal = $this->user('level_3', $this->a);
        $this->manager = $this->user('level_4', $employees[0]);
        $this->admin = $this->user('level_5', $employees[3]);
        $client = Client::create(['name' => 'Privacy Client']);
        $this->case = CaseFile::create(['title' => 'Privacy Case', 'reference_number' => 'PRIVATE-CASE', 'client_id' => $client->id, 'status' => 'active']);
        $this->ownDocument = $this->document('Public Document A');
        $this->privateDocument = $this->document('Public Document B');
        $this->own = $this->task($this->a, 'Owned pending', 'unaccepted', $this->ownDocument);
        $this->task($this->a, 'Owned completed', 'completed', $this->ownDocument);
        $this->other = $this->task($this->b, 'SECRET TASK B', 'unaccepted', $this->privateDocument);
        $this->task($this->b, 'SECRET COMPLETED', 'completed', $this->privateDocument);
        $this->task($employees[0], 'SECRET SENTINEL', 'unaccepted');
        $this->privateDocument->update(['assigned_employee_id' => $this->b->id, 'response_deadline' => now()->addDay()]);
        CaseActivity::create(['case_file_id' => $this->case->id, 'activity_type' => 'note', 'title' => 'SECRET AUDIT', 'content' => 'SECRET TASK B', 'occurred_at' => now(), 'metadata' => ['event' => 'task.created', 'task_id' => $this->other->id]]);
        CaseActivity::create(['case_file_id' => $this->case->id, 'activity_type' => 'note', 'title' => 'Owned audit', 'occurred_at' => now(), 'metadata' => ['event' => 'task.created', 'task_id' => $this->own->id]]);
        CaseActivity::create(['case_file_id' => $this->case->id, 'activity_type' => 'note', 'title' => 'SECRET ASSIGNMENT AUDIT', 'occurred_at' => now(), 'metadata' => ['event' => 'document_collection.updated', 'document_id' => $this->privateDocument->id, 'changes' => ['response_deadline' => ['before' => null, 'after' => '2026-10-08']]]]);
    }

    public function test_normal_role_loses_assignment_and_view_all_permissions(): void
    {
        $this->assertFalse($this->normal->hasPermission('task.assign'));
        $this->assertFalse($this->normal->hasPermission('task.manage'));
        $this->assertFalse($this->normal->hasPermission('task.review'));
        $this->assertFalse($this->normal->hasPermission('task.view_all'));
        foreach (['level_1', 'level_2', 'level_3'] as $role) {
            $this->assertFalse(Role::where('name', $role)->firstOrFail()->permissions()->where('name', 'task.view_all')->exists());
        }
        $this->assertNotEquals($this->normal->id, $this->a->id);
        $this->assertTrue($this->manager->hasPermission('task.view_all'));
        $this->assertTrue($this->admin->hasPermission('task.view_all'));
    }

    public function test_lists_counts_filters_search_and_pagination_use_only_visible_tasks(): void
    {
        $this->actingAs($this->normal, 'sanctum');
        $url = "/api/case-files/{$this->case->id}/case-tasks";
        $this->getJson($url)->assertOk()->assertJsonCount(2, 'tasks')->assertDontSee('SECRET');
        $this->getJson($url.'?status=unaccepted')->assertOk()->assertJsonCount(1, 'tasks');
        $this->getJson($url.'?status=completed')->assertOk()->assertJsonCount(1, 'tasks');
        $this->getJson($url.'?assignee_id='.$this->b->id)->assertOk()->assertJsonCount(0, 'tasks');
        $this->getJson($url.'?search=SECRET')->assertOk()->assertJsonCount(0, 'tasks');
        $this->getJson($url.'?per_page=1&page=1')->assertOk()->assertJsonCount(1, 'tasks')->assertJsonPath('pagination.total', 2)->assertJsonPath('pagination.last_page', 2);
        $this->getJson($url.'?per_page=1&page=3')->assertOk()->assertJsonCount(0, 'tasks')->assertJsonPath('pagination.total', 2);
        $this->own->update(['due_at' => now()->subMinute()]);
        $this->other->update(['due_at' => now()->subDays(2)]);
        $this->getJson($url.'?overdue=1')->assertOk()->assertJsonCount(1, 'tasks');
        $this->getJson("/api/case-files/{$this->case->id}/workspace")->assertOk()->assertJsonCount(2, 'case_file.case_tasks')->assertJsonPath('summary.open_tasks', 1)->assertDontSee('SECRET');
    }

    public function test_existing_role_permissions_are_updated_without_overwriting_other_grants(): void
    {
        $permission = Permission::where('name', 'task.view_all')->firstOrFail();
        $low = Role::where('name', 'level_3')->firstOrFail();
        $high = Role::where('name', 'level_4')->firstOrFail();
        $developer = Role::where('name', 'developer')->firstOrFail()->permissions()->pluck('permissions.id')->sort()->values()->all();
        $low->permissions()->syncWithoutDetaching([$permission->id]);
        $high->permissions()->detach($permission->id);
        // Owner-approved B2.6 contract: catalog seeding preserves operator decisions,
        // including a custom lawful grant and a revoked historical default.
        $before = $low->permissions()->pluck('permissions.id')->sort()->values()->all();
        $highBefore = $high->permissions()->pluck('permissions.id')->sort()->values()->all();
        $this->seed(TaskVisibilityPermissionSeeder::class);
        $this->seed(TaskVisibilityPermissionSeeder::class);
        $this->assertSame($before, $low->permissions()->pluck('permissions.id')->sort()->values()->all());
        $this->assertFalse($high->permissions()->where('name', 'task.view_all')->exists());
        $this->assertSame($highBefore, $high->permissions()->pluck('permissions.id')->sort()->values()->all());
        $this->assertSame($developer, Role::where('name', 'developer')->firstOrFail()->permissions()->pluck('permissions.id')->sort()->values()->all());
    }

    public function test_direct_read_update_and_delete_of_another_task_are_forbidden(): void
    {
        $this->actingAs($this->normal, 'sanctum');
        $base = "/api/case-files/{$this->case->id}/case-tasks/";
        $this->getJson($base.$this->own->id)->assertOk()->assertJsonPath('task.id', $this->own->id);
        $this->getJson($base.$this->other->id)->assertForbidden()->assertDontSee('SECRET');
        $this->patchJson($base.$this->other->id, ['status' => 'completed'])->assertForbidden();
        $this->deleteJson($base.$this->other->id)->assertForbidden();
        $this->assertDatabaseHas('case_tasks', ['id' => $this->other->id, 'status' => 'unaccepted', 'deleted_at' => null]);
        $this->patchJson($base.$this->own->id, ['status' => 'in_progress'])->assertForbidden();
        $this->postJson($base.$this->own->id.'/accept')->assertOk()->assertJsonPath('task.status', 'in_progress');
    }

    public function test_level_one_and_two_also_receive_only_their_own_tasks(): void
    {
        foreach (['level_1', 'level_2'] as $role) {
            $employee = $this->a->replicate();
            $employee->employee_code = 'PRIVATE-'.$role;
            $employee->save();
            $user = $this->user($role, $employee);
            $own = $this->task($employee, 'Lower-level own task', 'unaccepted');
            $base = "/api/case-files/{$this->case->id}/case-tasks";
            $this->actingAs($user, 'sanctum')->getJson($base)->assertOk()->assertJsonCount(1, 'tasks')->assertJsonPath('tasks.0.id', $own->id)->assertDontSee('SECRET');
            $this->getJson($base.'/'.$this->other->id)->assertForbidden();
            $result = app(QueryCaseTasksTool::class)->execute(['scope' => 'case', 'case_id' => $this->case->id]);
            $this->assertSame(1, $result['total_count']);
            $this->assertSame([$own->id], array_column($result['tasks'], 'task_id'));
        }
    }

    public function test_level_four_and_five_see_all_but_do_not_bypass_case_gates(): void
    {
        foreach ([$this->manager, $this->admin] as $user) {
            $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$this->case->id}/case-tasks?per_page=2")->assertOk()->assertJsonPath('pagination.total', 5);
            $this->getJson("/api/case-files/{$this->case->id}/case-tasks/{$this->other->id}")->assertOk();
        }
        $different = CaseFile::create(['title' => 'Different case', 'client_id' => $this->case->client_id, 'status' => 'active']);
        $this->getJson("/api/case-files/{$different->id}/case-tasks/{$this->other->id}")->assertNotFound();
        Role::where('name', 'level_4')->firstOrFail()->permissions()->detach(Permission::where('name', 'case.view')->value('id'));
        $this->actingAs($this->manager, 'sanctum')->getJson("/api/case-files/{$this->case->id}/case-tasks")->assertForbidden();
        $this->assertCount(0, CaseTask::query()->visibleTo($this->manager)->get());
    }

    public function test_document_progress_is_case_visible_but_private_tasks_and_actions_remain_protected(): void
    {
        $this->actingAs($this->normal, 'sanctum');
        $url = "/api/case-files/{$this->case->id}/document-collection";
        $this->getJson($url.'/'.$this->privateDocument->id)->assertOk()->assertJsonPath('document.active_task.id', $this->other->id)
            ->assertJsonPath('document.assigned_employee.id', $this->b->id)->assertJsonPath('document.capabilities.can_upload', false)
            ->assertJsonPath('document.capabilities.can_edit', false)->assertDontSee('SECRET');
        $this->getJson($url.'/'.$this->ownDocument->id)->assertOk()->assertJsonPath('document.active_task.id', $this->own->id);
        $this->getJson($url.'?assignee_id='.$this->b->id)->assertOk()->assertJsonCount(1, 'documents')->assertJsonPath('pagination.total', 1);
        $this->getJson("/api/case-files/{$this->case->id}/case-tasks/options")->assertForbidden();
        $this->getJson("/api/case-files/{$this->case->id}")->assertOk()->assertDontSee('SECRET');
        $raw = $this->getJson("/api/case-files/{$this->case->id}/workspace")->assertOk()->json('case_file.documents');
        $private = collect($raw)->firstWhere('id', $this->privateDocument->id);
        $this->assertNull($private['assigned_employee_id']);
        $this->assertNull($private['response_deadline']);
        $this->patchJson($url.'/'.$this->privateDocument->id, ['response_deadline' => '2027-01-01'])->assertForbidden();
        $this->assertDatabaseHas('case_activities', ['title' => 'SECRET AUDIT']);
        $this->own->delete();
        $this->getJson("/api/case-files/{$this->case->id}/workspace")->assertOk()->assertSee('Owned audit')->assertDontSee('SECRET');
    }

    public function test_document_progress_remains_visible_for_completed_and_legacy_tasks(): void
    {
        $this->other->update(['status' => 'completed']);
        $this->actingAs($this->normal, 'sanctum');
        $url = "/api/case-files/{$this->case->id}/document-collection/{$this->privateDocument->id}";
        $this->getJson($url)->assertOk()->assertJsonPath('document.assigned_employee.id', $this->b->id);
        CaseTask::where('case_document_id', $this->privateDocument->id)->delete();
        $this->getJson($url)->assertOk()->assertJsonPath('document.assigned_employee.id', $this->b->id);
        EmployeeTask::create(['case_document_id' => $this->privateDocument->id, 'employee_id' => $this->b->id, 'assigned_by' => $this->normal->id, 'title' => 'SECRET EMPLOYEE TASK', 'duration_minutes' => 60, 'status' => 'pending']);
        $this->getJson($url)->assertOk()->assertJsonPath('document.assigned_employee.id', $this->b->id)->assertDontSee('SECRET EMPLOYEE TASK');
    }

    public function test_normal_employee_cannot_create_or_reassign_tasks(): void
    {
        $this->actingAs($this->normal, 'sanctum');
        $base = "/api/case-files/{$this->case->id}/case-tasks";
        $this->postJson($base, ['title' => 'Assigned elsewhere', 'assigned_employee_id' => $this->b->id])->assertForbidden();
        $this->patchJson($base.'/'.$this->own->id, ['assigned_employee_id' => $this->b->id])->assertForbidden();
        $this->getJson($base.'/'.$this->own->id)->assertOk();
        $doc = $this->document('New document');
        $this->postJson($base.'/batch', ['tasks' => [['case_document_id' => $doc->id, 'assigned_employee_id' => $this->b->id, 'due_date' => '2026-10-10']]])->assertForbidden();
        $this->assertDatabaseMissing('case_tasks', ['case_document_id' => $doc->id]);
    }

    public function test_ai_case_my_upcoming_and_overdue_share_rest_visibility(): void
    {
        $tool = app(QueryCaseTasksTool::class);
        $this->actingAs($this->normal);
        $this->assertCount(1, $tool->execute(['scope' => 'my'])['tasks']);
        $this->assertCount(2, $tool->execute(['scope' => 'case', 'case_code' => $this->case->reference_number])['tasks']);
        $this->assertCount(1, $tool->execute(['scope' => 'upcoming'])['tasks']);
        $this->own->update(['due_at' => now()->subMinute()]);
        $this->other->update(['due_at' => now()->subDay()]);
        $this->assertCount(1, $tool->execute(['scope' => 'overdue'])['tasks']);
        foreach ([$this->b->id, 999999] as $id) {
            try {
                $tool->execute(['scope' => 'case', 'case_id' => $this->case->id, 'employee_id' => $id]);
                $this->fail('Other-employee lookup must be denied, including assignment-permission users.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('employee_id', $exception->errors());
            }
        }
        $this->actingAs($this->manager);
        $this->assertCount(5, $tool->execute(['scope' => 'case', 'case_id' => $this->case->id])['tasks']);
        $this->assertCount(1, $tool->execute(['scope' => 'my', 'employee_id' => $this->b->id])['tasks']);
        $this->assertCount(3, $tool->execute(['scope' => 'overdue'])['tasks']);
    }

    public function test_ai_task_card_metadata_uses_authorized_model_actions_and_server_deadlines(): void
    {
        $this->actingAs($this->normal);
        $tool = app(QueryCaseTasksTool::class);
        $result = $tool->execute(['scope' => 'my']);
        $this->assertSame(1, $result['total_count']);
        $row = $result['tasks'][0];
        $this->assertSame($this->own->id, $row['task_id']);
        $this->assertSame($this->case->id, $row['case_id']);
        $this->assertSame($this->own->title, $row['title']);
        $this->assertNull($row['required_document_code']);
        $this->assertSame($this->own->allowedActionsFor($this->normal), $row['allowed_actions']);
        $this->assertTrue($row['allowed_actions']['can_accept']);
        $this->assertFalse($row['allowed_actions']['can_approve']);
        $this->assertTrue($row['deadline_approaching']);
        $this->assertFalse($row['overdue']);
        $this->assertSame(now()->addDay()->toDateString(), $row['due_date']);
        $this->assertStringNotContainsString('SECRET', json_encode($result));
        $this->own->update(['status' => 'completed', 'due_at' => now()->subDay()]);
        $completed = $tool->execute(['scope' => 'my', 'status' => 'completed']);
        $this->assertCount(2, $completed['tasks']);
        foreach ($completed['tasks'] as $task) {
            $this->assertSame('completed', $task['status']);
            $this->assertFalse($task['overdue']);
            $this->assertFalse($task['deadline_approaching']);
        }
    }

    public function test_ai_task_pagination_counts_only_visible_rows_and_prioritizes_overdue_work(): void
    {
        $this->actingAs($this->normal);
        $last = null;
        for ($i = 0; $i < 105; $i++) $last = $this->task($this->a, 'Authorized task '.$i, 'in_progress');
        $last->update(['due_at' => now()->subDay()]);
        $tool = app(QueryCaseTasksTool::class);
        $first = $tool->execute(['scope' => 'my']);
        $this->assertSame(106, $first['total_count']);
        $this->assertCount(100, $first['tasks']);
        $this->assertSame($last->id, $first['tasks'][0]['task_id']);
        $this->assertTrue($first['tasks'][0]['overdue']);
        $this->assertTrue($first['has_more']);
        $this->assertSame(100, $first['next_offset']);
        $second = $tool->execute(['scope' => 'my', 'offset' => $first['next_offset']]);
        $this->assertCount(6, $second['tasks']);
        $this->assertSame(106, $second['total_count']);
        $this->assertFalse($second['has_more']);
        $this->assertNull($second['next_offset']);
        $this->assertSame([], array_intersect(array_column($first['tasks'], 'task_id'), array_column($second['tasks'], 'task_id')));
        $this->assertStringNotContainsString('SECRET', json_encode([$first, $second]));
    }

    public function test_admin_without_employee_profile_uses_the_same_case_visibility_in_ai(): void
    {
        $this->admin->update(['employee_id' => null]);
        $this->actingAs($this->admin, 'sanctum');
        $this->getJson("/api/case-files/{$this->case->id}/case-tasks")->assertOk()->assertJsonCount(5, 'tasks');
        $tool = app(QueryCaseTasksTool::class);
        $this->assertCount(5, $tool->execute(['scope' => 'case', 'case_id' => $this->case->id])['tasks']);
        $this->assertCount(0, $tool->execute(['scope' => 'my'])['tasks']);
    }

    public function test_organization_and_active_attendance_do_not_expose_other_current_tasks(): void
    {
        foreach ([$this->a, $this->b] as $employee) {
            $attendance = Attendance::create(['employee_id' => $employee->id, 'employee_name' => $employee->full_name, 'work_date' => now()->toDateString(), 'clock_in' => now(), 'status' => 'working']);
            $session = WorkSession::create(['attendance_id' => $attendance->id, 'task_description' => $employee->id === $this->a->id ? 'OWN WORK SESSION' : 'SECRET WORK SESSION', 'started_at' => now(), 'expected_end_at' => now()->addHour(), 'status' => 'active']);
            if ($employee->id === $this->b->id) {
                EmployeeTask::create(['employee_id' => $employee->id, 'case_document_id' => $this->privateDocument->id, 'work_session_id' => $session->id, 'assigned_by' => $this->manager->id, 'title' => 'SECRET LINKED WORK', 'duration_minutes' => 60, 'status' => 'in_progress']);
            }
        }
        $this->actingAs($this->normal, 'sanctum');
        $this->getJson('/api/organization')->assertOk()->assertSee('OWN WORK SESSION')->assertDontSee('SECRET WORK SESSION');
        $this->getJson('/api/attendances/active')->assertOk()->assertSee('OWN WORK SESSION')->assertDontSee('SECRET WORK SESSION');
        $this->actingAs($this->manager, 'sanctum')->getJson('/api/organization')->assertOk()->assertSee('SECRET WORK SESSION');
        Role::where('name', 'level_4')->firstOrFail()->permissions()->detach(Permission::where('name', 'case.view')->value('id'));
        $this->getJson('/api/organization')->assertOk()->assertDontSee('SECRET WORK SESSION');
        $this->getJson('/api/attendances/active')->assertOk()->assertDontSee('SECRET WORK SESSION');
    }

    private function user(string $role, Employee $employee): User
    {
        $user = User::factory()->create(['employee_id' => $employee->id, 'role' => 'employee']);
        $user->roles()->sync([Role::where('name', $role)->value('id')]);

        return $user;
    }

    private function document(string $title): CaseDocument
    {
        return CaseDocument::create(['case_file_id' => $this->case->id, 'title' => $title, 'category' => 'required', 'requirement_level' => 'required', 'necessity_status' => 'required', 'status' => 'not_requested']);
    }

    private function task(Employee $employee, string $title, string $status, ?CaseDocument $document = null): CaseTask
    {
        return CaseTask::create(['case_file_id' => $this->case->id, 'case_document_id' => $document?->id, 'assigned_employee_id' => $employee->id, 'title' => $title, 'status' => $status, 'due_at' => $employee->id === $this->a->id ? now()->addDay() : now()->subDay()]);
    }
}
