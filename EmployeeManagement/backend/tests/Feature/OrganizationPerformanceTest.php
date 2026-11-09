<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\CaseActivity;
use App\Models\Employee;
use App\Models\EmployeeTask;
use App\Models\Permission;
use App\Models\User;
use App\Models\WorkSession;
use App\Services\Administration\AdminCapabilities;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class OrganizationPerformanceTest extends B21TestCase
{
    // Captured on the unoptimized controller with these frozen synthetic fixtures.
    // Assert the whole response, not just count/status; no real data or credentials.
    private const DIRECTORY_BODIES = [
        1 => 'b4509b35d61406444de6172430db32200c85883fd7ffcb60b3ed169d6af0d28a',
        21 => '382b30f90c3324ae0c0cc55c964995fc9e65fb1f0e698c810a228cba4f3e8d40',
        101 => '0d1005a95615b81ebe076e10d86c25f814026419d56365266e58025156420cf2',
        301 => '142041b70bb1f9529b342db232192a35d67fd92888ecdc13f0d337966cc2ba38',
    ];
    private const WORK_BODIES = [
        1 => '2b74022cfecc3b66316562db7c155709e2c6f8c07a582d01bbaef8e264c48c07',
        21 => '3ced0a7792d09b5724c3606471741fae55d4223f010b9a5d1e53fe8d8d3814c5',
        101 => 'ec11e5e4c18168a6779b06609620e0a2bdeeaf8d92b7cbf178fa272e81fd03ec',
    ];
    private bool $measuring = false;
    private int $queries = 0;

    protected function setUp(): void
    {
        parent::setUp(); // Guarded SQLite :memory: only, before fixture writes.
        $this->travelTo(new \DateTimeImmutable('2026-10-22T11:00:00+09:00'));
        DB::listen(function () {
            if ($this->measuring) $this->queries++;
        });
    }

    private function measure(string $uri, string $scenario, int $size): array
    {
        $this->queries = 0;
        $started = hrtime(true);
        $this->measuring = true;
        try {
            $response = $this->getJson($uri);
        } finally {
            $this->measuring = false;
        }
        $record = ['scenario' => $scenario, 'employees' => $size,
            'route' => preg_replace('/\d+/', '{caseFile}', $uri), 'status' => $response->status(),
            'queries' => $this->queries, 'duration_ms' => round((hrtime(true) - $started) / 1_000_000, 2),
            // Synthetic-only body fingerprint for full before/after contract comparison.
            'response_sha256' => hash('sha256', $response->getContent())];
        file_put_contents(storage_path('logs/organization-performance.jsonl'), json_encode($record)."\n", FILE_APPEND);
        $response->assertOk();
        return [$response, $record];
    }

    public function test_directory_query_count_does_not_scale_with_employee_count(): void
    {
        $actor = $this->fixtureUser('perf-reader', ['employee.view', 'case.view', 'task.view_own']);
        $this->actingAs($actor);
        $case = $this->matter($actor->employee);
        $counts = [];
        foreach ([1, 21, 101, 301] as $size) {
            while (Employee::count() < $size) $this->fixtureEmployee('perf-member-'.Employee::count());
            [$response, $record] = $this->measure('/api/organization', 'directory', $size);
            $this->assertSame(self::DIRECTORY_BODIES[$size], $record['response_sha256']);
            $this->assertCount($size, $response->json('employees'));
            foreach ($response->json('employees') as $row) {
                foreach (['phone', 'date_of_birth', 'nationality_code'] as $private) $this->assertNull($row[$private]);
            }
            $counts[] = $record['queries'];
            foreach (['/api/me', '/api/case-files', '/api/case-files/'.$case->id.'/workspace'] as $uri) {
                $this->measure($uri, 'directory', $size);
            }
        }
        $this->assertLessThanOrEqual(6, max($counts) - min($counts), 'Directory queries must not grow per employee.');
    }

    private function work(User $owner, User $assigner): void
    {
        $attendance = Attendance::create(['employee_id' => $owner->employee_id, 'employee_name' => 'Synthetic worker', 'work_date' => today(),
            'clock_in' => now(), 'status' => 'working']);
        $session = WorkSession::create(['attendance_id' => $attendance->id, 'task_description' => 'SYNTHETIC PRIVATE WORK',
            'started_at' => now(), 'expected_end_at' => now()->addHour(), 'status' => 'active']);
        EmployeeTask::create(['employee_id' => $owner->employee_id, 'assigned_by' => $assigner->id,
            'work_session_id' => $session->id, 'title' => 'Synthetic assignment', 'description' => 'Synthetic details',
            'duration_minutes' => 60, 'status' => 'in_progress', 'accepted_at' => now(), 'due_at' => now()->addHour()]);
    }

    public function test_active_work_query_count_does_not_scale_with_employee_count(): void
    {
        $actor = $this->fixtureUser('perf-work-reader', ['employee.view', 'case.view', 'task.view_all']);
        $this->actingAs($actor);
        $this->work($actor, $actor);
        $counts = [];
        foreach ([1, 21, 101] as $size) {
            while (Employee::count() < $size) {
                $owner = $this->fixtureEmployee('perf-working-'.Employee::count());
                $this->work($owner, $actor);
            }
            [$response, $record] = $this->measure('/api/organization', 'active-work', $size);
            $this->assertSame(self::WORK_BODIES[$size], $record['response_sha256']);
            $this->assertCount($size, $response->json('employees'));
            foreach ($response->json('employees') as $row) {
                $this->assertSame('SYNTHETIC PRIVATE WORK', $row['attendance']['current_task']['task_description']);
            }
            $counts[] = $record['queries'];
        }
        $this->assertLessThanOrEqual(6, max($counts) - min($counts), 'Active-work queries must not grow per employee.');
    }

    public static function readers(): array
    {
        return [
            'ordinary' => [[], false, false],
            'explicit-private' => [['employee.view_private'], false, true],
            'former-hr-bridge-is-redacted' => [['employee.update'], false, false],
            'new-update-not-private' => [['employee.update'], true, false],
            'admin-not-private' => [[], true, false, true],
            'admin-explicit-private' => [['employee.view_private'], true, true, true],
        ];
    }

    #[DataProvider('readers')]
    public function test_projection_and_per_employee_policy_results_are_preserved(array $grants, bool $newIdentity, bool $private, bool $admin = false): void
    {
        $actor = $this->fixtureUser('perf-contract', ['employee.view', 'task.view_own', ...$grants], $admin ? 'admin' : null);
        $actor->forceFill(['pii_requires_explicit' => $newIdentity])->save();
        $target = $this->fixtureEmployee('perf-contract-target');
        foreach ([$actor, $target] as $owner) {
            $owner->employee->update(['phone' => 'SYNTHETIC PHONE', 'date_of_birth' => '2000-01-01', 'nationality_code' => 'ZZ']);
            $this->work($owner, $actor);
        }
        $this->actingAs($actor);
        [$response] = $this->measure('/api/organization', 'contract-'.implode('-', $grants).'-'.(int) $newIdentity, 2);
        $this->assertSame(['summary', 'employees', 'available_roles'], array_keys($response->json()));
        foreach ($response->json('employees') as $row) {
            $employee = Employee::findOrFail($row['id']);
            // Independent A04 matrix: a private grant is not organization-wide subject scope.
            $expectedPrivate = $private && $employee->id === $actor->employee_id;
            $reference = ! $employee->trashed() && $employee->id === $actor->employee_id
                && AdminCapabilities::active($actor) && AdminCapabilities::explicit($actor, 'employee.view_private');
            $this->assertSame($expectedPrivate, $reference);
            $this->assertSame($reference, Gate::forUser($actor)->allows('viewPrivate', $employee));
            $this->assertSame($expectedPrivate ? 'SYNTHETIC PHONE' : null, $row['phone']);
            $this->assertSame($expectedPrivate ? '2000-01-01' : null, $row['date_of_birth']);
            $this->assertSame($expectedPrivate ? 'ZZ' : null, $row['nationality_code']);
            $this->assertSame($employee->employee_code, $row['employee_code']);
            $row['id'] === $actor->employee_id
                ? $this->assertSame('SYNTHETIC PRIVATE WORK', $row['attendance']['current_task']['task_description'])
                : $this->assertNull($row['attendance']['current_task']);
        }
    }

    public function test_batch_task_visibility_is_fresh_after_grant_revoke_and_case_deletion(): void
    {
        $actor = $this->fixtureUser('perf-task-scope', ['employee.view', 'case.view', 'task.view_own']);
        $other = $this->fixtureEmployee('perf-other');
        $this->work($other, $actor);
        $case = $this->matter($other->employee);
        $document = $case->documents()->create(['title' => 'Synthetic scoped document', 'category' => 'Synthetic']);
        EmployeeTask::where('employee_id', $other->employee_id)->update(['case_document_id' => $document->id]);
        $token = $actor->createToken('synthetic-performance')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $role = $actor->roles()->sole();
        $permission = Permission::where('name', 'task.view_all')->sole();
        $fetch = function () use ($token, $other) {
            return collect($this->withToken($token)->getJson('/api/organization')->assertOk()->json('employees'))
                ->firstWhere('id', $other->employee_id)['attendance']['current_task'];
        };
        $this->assertNull($fetch());
        $role->permissions()->attach($permission->id);
        $this->assertSame('SYNTHETIC PRIVATE WORK', $fetch()['task_description']);
        $role->permissions()->detach($permission->id);
        $this->assertNull($fetch());
        $role->permissions()->attach($permission->id);
        $case->delete();
        $this->assertNull($fetch(), 'A deleted case must still hide its task-bound work session.');
    }

    public function test_unlinked_session_and_mismatched_task_assignee_follow_the_original_rule(): void
    {
        $actor = $this->fixtureUser('perf-session-owner', ['employee.view', 'task.view_own']);
        $other = $this->fixtureEmployee('perf-session-other');
        $this->work($actor, $actor);
        $this->work($other, $actor);
        $this->actingAs($actor);
        $ownTask = EmployeeTask::where('employee_id', $actor->employee_id)->sole();
        $fetch = fn () => collect($this->getJson('/api/organization')->assertOk()->json('employees'))->keyBy('id');
        $ownTask->update(['employee_id' => $other->employee_id]);
        $this->assertNull($fetch()[$actor->employee_id]['attendance']['current_task']);
        $ownTask->delete();
        $rows = $fetch();
        $this->assertSame('SYNTHETIC PRIVATE WORK', $rows[$actor->employee_id]['attendance']['current_task']['task_description']);
        $this->assertNull($rows[$other->employee_id]['attendance']['current_task']);
    }

    public function test_directory_policy_rechecks_grants_and_lifecycle_despite_loaded_roles(): void
    {
        $actor = $this->fixtureUser('perf-policy', ['employee.view', 'employee.view_private']);
        $target = $actor->employee;
        $outside = $this->fixtureEmployee('perf-policy-target')->employee;
        $gate = Gate::forUser($actor->load('roles.permissions', 'employee'));
        $this->assertTrue($gate->allows('viewPrivateDirectory', Employee::class));
        $this->assertTrue($gate->allows('viewPrivate', $target));
        $this->assertFalse($gate->allows('viewPrivate', $outside));
        $role = $actor->roles()->sole();
        $permission = Permission::where('name', 'employee.view_private')->sole();
        $role->permissions()->detach($permission->id);
        $this->assertFalse($gate->allows('viewPrivateDirectory', Employee::class));
        $role->permissions()->attach($permission->id);
        $this->assertTrue($gate->allows('viewPrivateDirectory', Employee::class));
        $actor->fresh()->forceFill(['is_active' => false])->save();
        $this->assertFalse($gate->allows('viewPrivateDirectory', Employee::class));
        $actor->fresh()->forceFill(['is_active' => true, 'activation_required' => true])->save();
        $this->assertFalse($gate->allows('viewPrivateDirectory', Employee::class));
        $actor->fresh()->forceFill(['activation_required' => false])->save();
        $actor->employee->update(['status' => 'resigned']);
        $this->assertFalse($gate->allows('viewPrivateDirectory', Employee::class));
        $actor->employee->update(['status' => 'active']);
        $target->delete();
        $this->assertFalse($gate->allows('viewPrivate', $target));
    }

    public function test_workspace_document_and_history_scaling_preserves_task_privacy(): void
    {
        $actor = $this->fixtureUser('perf-workspace', ['employee.view', 'case.view', 'task.view_own', 'task.update']);
        $other = $this->fixtureEmployee('perf-workspace-other');
        $case = $this->matter($actor->employee);
        $case->caseTasks()->create(['assigned_employee_id' => $actor->employee_id,
            'title' => 'Synthetic own task', 'description' => 'Synthetic own details', 'status' => 'in_progress']);
        $private = $case->caseTasks()->create(['assigned_employee_id' => $other->employee_id,
            'title' => 'SYNTHETIC PRIVATE TASK', 'description' => 'SYNTHETIC PRIVATE TASK', 'status' => 'in_progress']);
        CaseActivity::create(['case_file_id' => $case->id, 'title' => 'SYNTHETIC PRIVATE TASK', 'activity_type' => 'note',
            'channel' => 'internal', 'occurred_at' => now(), 'metadata' => ['task_id' => $private->id, 'event' => 'task.created']]);
        $this->actingAs($actor);
        $workspaceQueries = [];
        $historyQueries = [];
        foreach ([1, 21, 101] as $size) {
            while ($case->documents()->count() < $size) {
                $case->documents()->create(['title' => 'Synthetic document', 'category' => 'Synthetic',
                    'created_by_employee_id' => $actor->employee_id, 'confirmed_by_employee_id' => $actor->employee_id]);
                $case->activities()->create(['title' => 'Synthetic audit', 'activity_type' => 'note', 'channel' => 'internal',
                    'occurred_at' => now(), 'created_by_employee_id' => $actor->employee_id]);
            }
            [$workspace, $record] = $this->measure('/api/case-files/'.$case->id.'/workspace', 'case-documents-and-activities-'.$size, 2);
            $this->assertSame([
                1 => '7bc871c2ad4e342793f6564b258acbe2345bcc693ab558a99761fa0ac6ab5dc1',
                21 => 'bb25ca4e22c6260d0a75ac9730aa3c4c61885807fe717e1ca97ca05d5e08ba46',
                101 => 'db5bf19d9a12e5dfba5895bd433675f6f00a2bf93ea09f1ab70ef28c3de67a1f',
            ][$size], $record['response_sha256']);
            $workspace->assertJsonCount($size, 'case_file.documents')->assertJsonCount(1, 'case_file.case_tasks')
                ->assertDontSee('SYNTHETIC PRIVATE TASK');
            $workspaceQueries[] = $record['queries'];
            [$history, $record] = $this->measure('/api/case-files/'.$case->id.'/history', 'case-documents-and-activities-'.$size, 2);
            $history->assertDontSee('SYNTHETIC PRIVATE TASK');
            $historyQueries[] = $record['queries'];
        }
        $this->assertLessThanOrEqual(6, max($workspaceQueries) - min($workspaceQueries));
        $this->assertLessThanOrEqual(6, max($historyQueries) - min($historyQueries));
    }
}
