<?php

namespace Tests\Feature;

use App\AI\Tools\QueryCaseTasksTool;
use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseDocument;
use App\Models\CaseActivity;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\Client;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\ExternalStorageLocation;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use App\Services\GoogleDriveProvisioningService;
use App\Services\GoogleDriveService;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CaseTaskWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_required_documents_are_created_as_independent_tasks_in_one_batch(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        $documents = collect([
            $this->document($case, '委任契約書', 'required'),
            $this->document($case, '事故証明書', 'required'),
            $this->document($case, '給与明細', 'required'),
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
            'tasks' => $documents->values()->map(fn (CaseDocument $document, int $index) => [
                'case_document_id' => $document->id,
                'assigned_employee_id' => $employees[$index]->id,
                'due_date' => '2026-10-0'.($index + 2),
            ])->all(),
        ]);

        $response->assertCreated()->assertJsonCount(3, 'tasks');
        foreach ($documents as $index => $document) {
            $this->assertDatabaseHas('case_tasks', [
                'case_file_id' => $case->id,
                'case_document_id' => $document->id,
                'assigned_employee_id' => $employees[$index]->id,
                'status' => 'unaccepted',
            ]);
        }
    }

    public function test_optional_or_cross_case_requirement_rolls_back_the_whole_batch(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        $required = $this->document($case, '事故証明書', 'required');
        $optional = $this->document($case, '参考資料', 'not_required');

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
            'tasks' => [
                ['case_document_id' => $required->id, 'assigned_employee_id' => $employees[0]->id, 'due_date' => '2026-10-02'],
                ['case_document_id' => $optional->id, 'assigned_employee_id' => $employees[1]->id, 'due_date' => '2026-10-03'],
            ],
        ])->assertUnprocessable();

        $this->assertDatabaseCount('case_tasks', 0);

        $otherCase = CaseFile::create(['title' => '別案件', 'client_id' => $case->client_id, 'status' => 'active']);
        $otherDocument = $this->document($otherCase, '別案件資料', 'required');
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
            'tasks' => [['case_document_id' => $otherDocument->id, 'assigned_employee_id' => $employees[0]->id, 'due_date' => '2026-10-04']],
        ])->assertUnprocessable();
        $this->assertDatabaseCount('case_tasks', 0);
    }

    public function test_normal_task_creation_rejects_active_and_completed_duplicates(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        $document = $this->document($case, '委任契約書', 'required');
        $payload = ['tasks' => [[
            'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[0]->id,
            'due_date' => '2026-10-02',
        ]]];

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", $payload)->assertCreated();
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", $payload)
            ->assertConflict()->assertJsonPath('code', 'case_document_task_exists');
        $this->assertDatabaseCount('case_tasks', 1);

        CaseTask::query()->firstOrFail()->update(['status' => 'completed', 'completed_at' => now()]);
        $before = CaseTask::query()->firstOrFail()->getAttributes();
        $activities = CaseActivity::count();
        $notifications = EmployeeNotification::count();
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", $payload)->assertConflict();
        $this->assertDatabaseCount('case_tasks', 1);
        $this->assertSame($before, CaseTask::query()->firstOrFail()->getAttributes());
        $this->assertSame($activities, CaseActivity::count());
        $this->assertSame($notifications, EmployeeNotification::count());

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/case-files/{$case->id}/case-tasks")
            ->assertOk()
            ->assertJsonCount(1, 'tasks')
            ->assertJsonPath('tasks.0.case_document_id', $document->id);
    }

    public function test_every_existing_task_status_and_soft_deleted_history_blocks_normal_creation(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        foreach ([...CaseTask::STATUSES, 'soft_deleted'] as $index => $status) {
            $document = $this->document($case, '資料'.$index, 'required');
            $task = CaseTask::create([
                'case_file_id' => $case->id, 'case_document_id' => $document->id,
                'title' => '既存タスク'.$index, 'assigned_employee_id' => $employees[0]->id,
                'status' => $status === 'soft_deleted' ? 'completed' : $status,
                'due_at' => '2026-10-10 23:59:59',
            ]);
            if ($status === 'soft_deleted') $task->delete();
            $before = CaseTask::withTrashed()->findOrFail($task->id)->getAttributes();
            $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
                'tasks' => [['case_document_id' => $document->id, 'assigned_employee_id' => $employees[1]->id, 'due_date' => '2026-10-12']],
            ])->assertConflict()->assertJsonPath('message', 'この資料にはすでにタスクが作成されています。');
            $this->assertSame($before, CaseTask::withTrashed()->findOrFail($task->id)->getAttributes());
            $option = collect($this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case->id}/case-tasks/options")->assertOk()->json('required_documents'))->firstWhere('id', $document->id);
            $this->assertTrue($option['has_existing_task']);
            $this->assertSame($task->id, $option['case_tasks'][0]['id']);
            $this->assertSame($status === 'soft_deleted' ? 'completed' : $status, $option['case_tasks'][0]['status']);
            $this->assertSame($employees[0]->full_name, $option['case_tasks'][0]['assigned_employee']['full_name']);
        }
        $this->assertDatabaseCount('case_tasks', count(CaseTask::STATUSES) + 1);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_stale_second_manager_submission_is_rejected_and_options_refresh_immediately(): void
    {
        [$first, $case, $employees] = $this->fixture('level_4');
        $second = $this->userForEmployee($employees[1], 'level_4');
        $document = $this->document($case, '本人確認資料', 'required');
        $url = "/api/case-files/{$case->id}/case-tasks";
        foreach ([$first, $second] as $user) {
            $this->actingAs($user, 'sanctum')->getJson($url.'/options')->assertOk()
                ->assertJsonPath('required_documents.0.has_existing_task', false);
        }
        $payload = ['tasks' => [['case_document_id' => $document->id, 'assigned_employee_id' => $employees[0]->id, 'due_date' => '2026-10-10']]];
        $this->actingAs($first, 'sanctum')->postJson($url.'/batch', $payload)->assertCreated();
        $before = CaseTask::query()->firstOrFail()->getAttributes();
        $activities = CaseActivity::count();
        $notifications = EmployeeNotification::count();
        $this->actingAs($second, 'sanctum')->postJson($url.'/batch', $payload)->assertConflict();
        $this->assertDatabaseCount('case_tasks', 1);
        $this->assertSame($before, CaseTask::query()->firstOrFail()->getAttributes());
        $this->assertSame($activities, CaseActivity::count());
        $this->assertSame($notifications, EmployeeNotification::count());
        $this->actingAs($second, 'sanctum')->getJson($url.'/options')->assertOk()
            ->assertJsonPath('required_documents.0.has_existing_task', true)
            ->assertJsonPath('required_documents.0.case_tasks.0.id', (int) $before['id']);
    }

    public function test_duplicate_batch_rolls_back_eligible_items_and_does_not_create_history(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        $eligible = $this->document($case, '新しい資料', 'required');
        $existing = $this->document($case, '既存資料', 'required');
        CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $existing->id, 'title' => '完了済み', 'status' => 'completed']);
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
            'tasks' => collect([$eligible, $existing])->map(fn ($document) => ['case_document_id' => $document->id, 'assigned_employee_id' => $employees[0]->id, 'due_date' => '2026-10-10'])->all(),
        ])->assertConflict();
        $this->assertDatabaseCount('case_tasks', 1);
        $this->assertDatabaseMissing('case_tasks', ['case_document_id' => $eligible->id]);
        $this->assertDatabaseCount('case_activities', 0);
        $this->assertDatabaseCount('employee_notifications', 0);
    }

    public function test_private_existing_task_still_blocks_creation_without_exposing_task_details(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        $role = Role::query()->where('name', 'level_4')->firstOrFail();
        $role->permissions()->detach(\App\Models\Permission::query()->where('name', 'task.view_all')->value('id'));
        $this->assertTrue($user->hasPermission('task.manage'));
        $this->assertFalse($user->hasPermission('task.view_all'));
        $document = $this->document($case, '本人確認資料', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'title' => 'SECRET TASK TITLE', 'description' => 'SECRET TASK DESCRIPTION',
            'status' => 'completed', 'assigned_employee_id' => $employees[1]->id,
        ]);
        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case->id}/case-tasks/options")
            ->assertOk()->assertJsonPath('required_documents.0.has_existing_task', true)
            ->assertJsonCount(0, 'required_documents.0.case_tasks')->assertDontSee('SECRET');
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
            'tasks' => [['case_document_id' => $document->id, 'assigned_employee_id' => $employees[0]->id, 'due_date' => '2026-10-10']],
        ])->assertConflict()->assertJsonPath('code', 'case_document_task_exists')->assertDontSee('SECRET');
        $this->assertDatabaseCount('case_tasks', 1);
        $this->assertSame('completed', $task->fresh()->status);
    }

    public function test_task_options_expose_only_required_documents_for_the_current_case(): void
    {
        [$user, $case] = $this->fixture('level_4');
        $required = $this->document($case, '事故証明書', 'required');
        $this->document($case, '参考資料', 'not_required');
        $otherCase = CaseFile::create(['title' => '別案件', 'client_id' => $case->client_id, 'status' => 'active']);
        $this->document($otherCase, '別案件資料', 'required');

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/case-files/{$case->id}/case-tasks/options")
            ->assertOk()
            ->assertJsonCount(1, 'required_documents')
            ->assertJsonPath('required_documents.0.id', $required->id);
    }

    public function test_user_without_case_update_cannot_create_tasks(): void
    {
        [$user, $case, $employees] = $this->fixture('level_2');
        $document = $this->document($case, '事故証明書', 'required');

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/batch", [
            'tasks' => [['case_document_id' => $document->id, 'assigned_employee_id' => $employees[0]->id, 'due_date' => '2026-10-02']],
        ])->assertForbidden();
    }

    public function test_ai_tool_returns_own_tasks_and_blocks_other_employee_without_permission(): void
    {
        [$user, $case, $employees] = $this->fixture('level_2');
        $user->forceFill(['employee_id' => $employees[0]->id])->save();
        $document = $this->document($case, '給与明細', 'required');
        CaseTask::create([
            'case_file_id' => $case->id,
            'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[0]->id,
            'title' => $document->title,
            'status' => 'unaccepted',
            'due_at' => '2026-10-02 23:59:59',
        ]);

        $this->actingAs($user);
        $result = app(QueryCaseTasksTool::class)->execute(['scope' => 'my']);
        $this->assertCount(1, $result['tasks']);
        $this->assertSame('給与明細', $result['tasks'][0]['required_document_name']);

        $this->expectException(ValidationException::class);
        app(QueryCaseTasksTool::class)->execute(['scope' => 'my', 'employee_id' => $employees[1]->id]);
    }

    public function test_ai_manager_can_query_a_case_by_code_and_today_scope_is_exact(): void
    {
        [$user, $case, $employees] = $this->fixture('level_4');
        $user->forceFill(['employee_id' => $employees[0]->id])->save();
        $document = $this->document($case, '事故証明書', 'required');

        foreach ([
            [$employees[0]->id, now()->endOfDay(), '本日期限'],
            [$employees[0]->id, now()->addDay()->endOfDay(), '翌日期限'],
            [$employees[1]->id, now()->endOfDay(), '他担当'],
        ] as [$employeeId, $dueAt, $title]) {
            CaseTask::create([
                'case_file_id' => $case->id,
                'case_document_id' => $document->id,
                'assigned_employee_id' => $employeeId,
                'title' => $title,
                'status' => 'unaccepted',
                'due_at' => $dueAt,
            ]);
        }

        $this->actingAs($user);
        $caseResult = app(QueryCaseTasksTool::class)->execute([
            'scope' => 'case',
            'case_code' => 'CASE-000049',
        ]);
        $this->assertCount(3, $caseResult['tasks']);

        $todayResult = app(QueryCaseTasksTool::class)->execute(['scope' => 'upcoming', 'days' => 1]);
        $this->assertCount(2, $todayResult['tasks']);
        $this->assertSame(now()->toDateString(), $todayResult['tasks'][0]['due_date']);
    }

    public function test_assignee_accepts_submits_resubmits_and_manager_reviews_exact_versions(): void
    {
        [$manager, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $other = $this->userForEmployee($employees[2], 'level_2');
        $document = $this->document($case, '委任状（民事）', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id,
            'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id,
            'created_by_employee_id' => $employees[0]->id,
            'title' => $document->title,
            'status' => 'unaccepted',
            'due_at' => now()->addWeek(),
        ]);

        $this->actingAs($other, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/accept")
            ->assertForbidden();
        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/accept")
            ->assertOk()
            ->assertJsonPath('task.status', 'in_progress');
        $this->assertNotNull($task->fresh()->accepted_at);

        $folder = (new ExternalStorageLocation)->forceFill(['external_folder_id' => 'drive-folder']);
        $this->mock(GoogleDriveProvisioningService::class)
            ->shouldReceive('provisionGeneratedDocuments')->twice()->andReturn($folder);
        $this->mock(GoogleDriveService::class)
            ->shouldReceive('storeTaskSubmission')->twice()->andReturn(
                ['external_file_id' => 'drive-v1', 'external_url' => 'https://drive.google.com/file/d/v1/view', 'filename' => 'v1.pdf', 'mime_type' => 'application/pdf', 'checksum' => 'v1'],
                ['external_file_id' => 'drive-v2', 'external_url' => 'https://drive.google.com/file/d/v2/view', 'filename' => 'v2.pdf', 'mime_type' => 'application/pdf', 'checksum' => 'v2'],
            );

        $first = $this->actingAs($employee, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->createWithContent('委任状.pdf', "%PDF-1.4\n% Synthetic evidence\n%%EOF")],
            ['Accept' => 'application/json'],
        );
        $first->assertCreated()->assertJsonPath('submission.version', 1);
        $submissionId = (int) $first->json('submission.id');
        $this->assertSame('pending_review', $task->fresh()->status);

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submissionId}/approve")
            ->assertForbidden();
        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submissionId}/reject", [])
            ->assertUnprocessable();
        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submissionId}/reject", ['reason' => '署名がありません。修正してください。'])
            ->assertOk()
            ->assertJsonPath('task.status', 'changes_requested');

        $second = $this->actingAs($employee, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->createWithContent('委任状_修正版.pdf', "%PDF-1.4\n% Synthetic revised evidence\n%%EOF")],
            ['Accept' => 'application/json'],
        );
        $second->assertCreated()->assertJsonPath('submission.version', 2);
        $secondId = (int) $second->json('submission.id');
        $this->assertSame('pending_review', $task->fresh()->status);
        $this->assertSame('reviewing', $document->fresh()->review_status);
        $this->assertSame('undetermined', $document->fresh()->fulfillment_status);
        $this->assertDatabaseHas('case_task_submissions', ['id' => $submissionId, 'version' => 1, 'review_status' => 'rejected']);
        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$secondId}/approve")
            ->assertOk()
            ->assertJsonPath('task.status', 'completed');
        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submissionId}/approve")
            ->assertUnprocessable();
    }

    public function test_normal_employee_cannot_reassign_change_deadline_or_jump_status(): void
    {
        [$manager, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $document = $this->document($case, '給与明細', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id, 'title' => $document->title,
            'status' => 'in_progress', 'due_at' => now()->addWeek(),
        ]);

        $this->actingAs($employee, 'sanctum')->patchJson("/api/case-files/{$case->id}/case-tasks/{$task->id}", [
            'assigned_employee_id' => $employees[1]->id,
            'due_at' => now()->addMonth()->toISOString(),
        ])->assertForbidden();
        $this->actingAs($employee, 'sanctum')->patchJson("/api/case-files/{$case->id}/case-tasks/{$task->id}", [
            'status' => 'completed',
        ])->assertForbidden();
        $this->assertSame('in_progress', $task->fresh()->status);
        $this->assertSame($employees[1]->id, $task->fresh()->assigned_employee_id);

        $newDeadline = now()->addMonth()->startOfMinute();
        $this->actingAs($manager, 'sanctum')->patchJson("/api/case-files/{$case->id}/case-tasks/{$task->id}", [
            'assigned_employee_id' => $employees[2]->id,
            'due_at' => $newDeadline->format('Y-m-d\TH:i:s'),
        ])->assertOk()->assertJsonPath('task.status', 'in_progress');
        $this->assertSame($employees[2]->id, $task->fresh()->assigned_employee_id);
        $this->assertEqualsWithDelta($newDeadline->getTimestamp(), $task->fresh()->due_at->getTimestamp(), 1);
    }

    public function test_standalone_assignment_and_real_changes_notify_only_the_assignee(): void
    {
        [$manager, $case, $employees] = $this->fixture('level_4');
        $assignee = $this->userForEmployee($employees[1], 'level_2');
        $observer = $this->userForEmployee($employees[2], 'level_2');
        $endpoint = "/api/case-files/{$case->id}/case-tasks";
        $taskId = $this->actingAs($manager, 'sanctum')->postJson($endpoint, [
            'title' => 'Synthetic standalone task',
            'assigned_employee_id' => $employees[1]->id,
        ])->assertCreated()->json('task.id');
        foreach (range(1, 2) as $repeat) {
            $this->patchJson("{$endpoint}/{$taskId}", ['priority' => 'high'])->assertOk();
        }
        $this->actingAs($assignee, 'sanctum')->getJson('/api/notifications/center?details=1')->assertOk()
            ->assertJsonPath('unread_count', 2)->assertJsonCount(2, 'notifications')
            ->assertJsonPath('notifications.0.case_task_id', $taskId)
            ->assertJsonPath('notifications.0.target_path', "/quests/{$case->id}")
            ->assertJsonPath('my_tasks_summary.items.0.case_id', $case->id)
            ->assertJsonPath('my_tasks_summary.items.0.id', $taskId);
        $this->actingAs($observer, 'sanctum')->getJson('/api/notifications/center?details=1')->assertOk()
            ->assertJsonPath('unread_count', 0)->assertJsonCount(0, 'my_tasks_summary.items');
    }

    public function test_overdue_is_derived_only_for_non_final_tasks_past_their_deadline(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $document = $this->document($case, '期限確認資料', 'required');

        foreach (['unaccepted', 'in_progress', 'pending_review', 'changes_requested'] as $status) {
            $task = CaseTask::create([
                'case_file_id' => $case->id,
                'case_document_id' => $document->id,
                'assigned_employee_id' => $employees[1]->id,
                'title' => $status,
                'status' => $status,
                'due_at' => now()->subMinute(),
            ]);
            $this->assertTrue($task->is_overdue, "{$status} should be overdue.");
        }

        foreach (['completed', 'cancelled'] as $status) {
            $task = CaseTask::create([
                'case_file_id' => $case->id,
                'case_document_id' => $document->id,
                'assigned_employee_id' => $employees[1]->id,
                'title' => $status,
                'status' => $status,
                'due_at' => now()->subMinute(),
            ]);
            $this->assertFalse($task->is_overdue, "{$status} must not be overdue.");
        }

        $future = CaseTask::create([
            'case_file_id' => $case->id,
            'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id,
            'title' => 'future',
            'status' => 'in_progress',
            'due_at' => now()->addMinute(),
        ]);
        $this->assertFalse($future->is_overdue);
    }

    public function test_drive_upload_is_cleaned_up_when_version_changes_before_database_commit(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $document = $this->document($case, '事故証明書', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id, 'title' => $document->title,
            'status' => 'in_progress', 'due_at' => now()->addWeek(),
        ]);
        $folder = (new ExternalStorageLocation)->forceFill(['external_folder_id' => 'drive-folder']);
        $this->mock(GoogleDriveProvisioningService::class)
            ->shouldReceive('provisionGeneratedDocuments')->once()->andReturn($folder);
        $drive = $this->mock(GoogleDriveService::class);
        $drive->shouldReceive('storeTaskSubmission')->once()->andReturnUsing(function () use ($task, $document, $employee): array {
            $document->taskSubmissions()->create([
                'case_task_id' => $task->id, 'version' => 1, 'source_type' => 'manual_upload',
                'review_status' => 'pending_review', 'storage_provider' => 'google_drive',
                'external_file_id' => 'competing', 'external_url' => 'https://drive.google.com/file/d/competing/view',
                'filename' => 'competing.pdf', 'mime_type' => 'application/pdf', 'submitted_by' => $employee->id,
                'submitted_at' => now(),
            ]);

            return ['external_file_id' => 'orphan', 'external_url' => 'https://drive.google.com/file/d/orphan/view', 'filename' => 'orphan.pdf', 'mime_type' => 'application/pdf', 'checksum' => null];
        });
        $drive->shouldReceive('deleteFile')->once()->with('orphan')->andReturnTrue();

        $this->actingAs($employee, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->createWithContent('事故証明書.pdf', "%PDF-1.4\n% Synthetic evidence\n%%EOF")],
            ['Accept' => 'application/json'],
        )->assertUnprocessable();
        $this->assertSame('in_progress', $task->fresh()->status);
    }

    public function test_drive_failure_does_not_create_a_submission_or_change_task_state(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $document = $this->document($case, '診断書', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id,
            'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id,
            'title' => $document->title,
            'status' => 'in_progress',
            'due_at' => now()->addWeek(),
        ]);
        $folder = (new ExternalStorageLocation)->forceFill(['external_folder_id' => 'drive-folder']);
        $this->mock(GoogleDriveProvisioningService::class)
            ->shouldReceive('provisionGeneratedDocuments')->once()->andReturn($folder);
        $this->mock(GoogleDriveService::class)
            ->shouldReceive('storeTaskSubmission')->once()
            ->andThrow(new GeneratedDocumentDriveException('ファイルのGoogle Driveへの保存に失敗しました。'));

        $this->actingAs($employee, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->createWithContent('診断書.pdf', "%PDF-1.4\n% Synthetic evidence\n%%EOF")],
            ['Accept' => 'application/json'],
        )->assertServiceUnavailable()
            ->assertJsonPath('message', GeneratedDocumentDriveException::PUBLIC_MESSAGE)
            ->assertJsonPath('code', 'document_provider_unavailable')->assertJsonStructure(['request_id']);

        $this->assertSame('in_progress', $task->fresh()->status);
        $this->assertDatabaseCount('case_task_submissions', 0);
    }

    public function test_task_upload_keeps_required_binary_and_size_validation_without_a_state_change(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $document = $this->document($case, '検証用資料', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id, 'title' => $document->title, 'status' => 'in_progress',
        ]);
        $this->mock(GoogleDriveProvisioningService::class)->shouldNotReceive('provisionGeneratedDocuments');
        $this->mock(GoogleDriveService::class)->shouldNotReceive('storeTaskSubmission');
        $url = "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions";
        $this->actingAs($employee, 'sanctum')->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->postJson($url, ['file' => ['name' => 'not-a-binary.pdf']])->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->post($url, ['file' => UploadedFile::fake()->create('oversized.pdf', 20481, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->assertSame('in_progress', $task->fresh()->status);
        $this->assertDatabaseCount('case_task_submissions', 0);
    }

    public function test_task_upload_rejects_another_assignee_before_drive_access(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $other = $this->userForEmployee($employees[2], 'level_2');
        $document = $this->document($case, '非公開資料', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id, 'title' => $document->title, 'status' => 'in_progress',
        ]);
        $this->mock(GoogleDriveProvisioningService::class)->shouldNotReceive('provisionGeneratedDocuments');
        $this->mock(GoogleDriveService::class)->shouldNotReceive('storeTaskSubmission');
        $this->actingAs($other, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->create('private.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'],
        )->assertForbidden();
        $this->assertSame('in_progress', $task->fresh()->status);
        $this->assertDatabaseCount('case_task_submissions', 0);
    }

    public function test_real_pdf_upload_is_shared_by_task_and_required_document_responses(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $document = $this->document($case, '提出資料', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id, 'title' => $document->title, 'status' => 'in_progress',
        ]);
        $bytes = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";
        $folder = (new ExternalStorageLocation)->forceFill(['external_folder_id' => 'drive-folder']);
        $this->mock(GoogleDriveProvisioningService::class)->shouldReceive('provisionGeneratedDocuments')->once()->andReturn($folder);
        $this->mock(GoogleDriveService::class)->shouldReceive('storeTaskSubmission')->once()
            ->withArgs(fn ($contents, $filename, $mime, $folderId, $key) => $contents === $bytes
                && str_ends_with($filename, '.pdf') && $mime === 'application/pdf' && $folderId === 'drive-folder' && is_string($key))
            ->andReturn(['external_file_id' => 'pdf-upload', 'external_url' => 'https://drive.google.com/file/d/pdf-upload/view',
                'filename' => 'submitted_v1.pdf', 'mime_type' => 'application/pdf', 'checksum' => hash('sha256', $bytes)]);
        $response = $this->actingAs($employee, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->createWithContent('actual.pdf', $bytes)], ['Accept' => 'application/json'],
        )->assertCreated()->assertJsonPath('task.status', 'pending_review')->assertJsonPath('submission.version', 1);
        $id = $response->json('submission.id');
        $this->getJson("/api/case-files/{$case->id}/workspace")->assertOk()
            ->assertJsonPath('case_file.case_tasks.0.latest_submission.id', $id)
            ->assertJsonPath('case_file.case_tasks.0.submissions.0.id', $id);
        $this->getJson("/api/case-files/{$case->id}/document-collection/{$document->id}")->assertOk()
            ->assertJsonPath('document.latest_task_submission.id', $id)
            ->assertJsonPath('document.latest_task_submission.filename', 'submitted_v1.pdf')
            ->assertJsonPath('document.workflow_state.code', 'pending_review');
    }

    public function test_employee_cannot_submit_a_completed_task(): void
    {
        [, $case, $employees] = $this->fixture('level_4');
        $employee = $this->userForEmployee($employees[1], 'level_2');
        $document = $this->document($case, '完了済み資料', 'required');
        $task = CaseTask::create([
            'case_file_id' => $case->id,
            'case_document_id' => $document->id,
            'assigned_employee_id' => $employees[1]->id,
            'title' => $document->title,
            'status' => 'completed',
            'due_at' => now()->subDay(),
            'completed_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')->post(
            "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions",
            ['file' => UploadedFile::fake()->createWithContent('完了済み資料.pdf', "%PDF-1.4\n% Synthetic evidence\n%%EOF")],
            ['Accept' => 'application/json'],
        )->assertUnprocessable();

        $this->assertDatabaseCount('case_task_submissions', 0);
        $this->assertSame('completed', $task->fresh()->status);
    }

    /** @return array{User, CaseFile, array<int, Employee>} */
    private function fixture(string $roleName): array
    {
        $this->seed(RolePermissionSeeder::class);
        $office = Office::create(['office_code' => 'TST', 'name' => 'Test Office', 'status' => 'active']);
        $employees = [];
        foreach (['TRINH THI THU HUONG', 'THAN VAN SAY', 'VU THI NGOC BICH'] as $index => $name) {
            $employees[] = Employee::create([
                'employee_code' => 'TMS-T'.($index + 1),
                'full_name' => $name,
                'office_id' => $office->id,
                'employment_type' => 'full_time',
                'hire_date' => '2026-01-01',
                'status' => 'active',
            ]);
        }
        $user = User::factory()->create(['employee_id' => $employees[0]->id]);
        $user->roles()->sync([Role::query()->where('name', $roleName)->value('id')]);
        $client = Client::create(['name' => 'PHAM GIA HUY']);
        $case = CaseFile::create(['title' => '交通事故', 'reference_number' => 'CASE-000049', 'client_id' => $client->id, 'status' => 'active']);

        return [$user, $case, $employees];
    }

    private function userForEmployee(Employee $employee, string $roleName): User
    {
        $user = User::factory()->create(['employee_id' => $employee->id]);
        $user->roles()->sync([Role::query()->where('name', $roleName)->value('id')]);

        return $user;
    }

    private function document(CaseFile $case, string $title, string $necessity): CaseDocument
    {
        return CaseDocument::create([
            'case_file_id' => $case->id,
            'category' => '必要資料',
            'title' => $title,
            'requirement_level' => $necessity === 'required' ? 'required' : 'optional',
            'necessity_status' => $necessity,
            'status' => 'not_requested',
        ]);
    }
}
