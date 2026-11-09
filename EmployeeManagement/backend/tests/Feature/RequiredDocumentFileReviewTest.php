<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\Client;
use App\Models\DocumentType;
use App\Models\Employee;
use App\Models\Office;
use App\Models\Permission;
use App\Models\ReceivedDocument;
use App\Models\Role;
use App\Models\User;
use App\Services\RequiredDocumentFileReview;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class RequiredDocumentFileReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $employee;

    private User $viewer;

    private CaseFile $case;

    private CaseDocument $document;

    private CaseTask $task;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        Storage::fake('local');
        $office = Office::create(['office_code' => 'RVW', 'name' => 'Review', 'status' => 'active']);
        foreach (['manager', 'employee', 'viewer'] as $index => $name) {
            $employee = Employee::create(['employee_code' => 'RVW-'.$index, 'full_name' => $name,
                'office_id' => $office->id, 'employment_type' => 'full_time', 'hire_date' => '2026-01-01', 'status' => 'active']);
            $user = User::factory()->create(['employee_id' => $employee->id]);
            $user->roles()->sync([Role::where('name', $index === 0 ? 'level_4' : 'level_2')->value('id')]);
            $this->{$name} = $user;
        }
        $client = Client::create(['name' => 'Review client']);
        $this->case = CaseFile::create(['title' => 'Review case', 'client_id' => $client->id, 'status' => 'active']);
        $this->document = CaseDocument::create(['case_file_id' => $this->case->id, 'title' => '本人確認資料',
            'category' => '必要資料', 'requirement_level' => 'required', 'necessity_status' => 'required',
            'status' => 'not_requested', 'assigned_employee_id' => $this->employee->employee_id,
            'response_deadline' => now()->addWeek()]);
        $this->task = CaseTask::create(['case_file_id' => $this->case->id, 'case_document_id' => $this->document->id,
            'title' => $this->document->title, 'description' => 'Private task text',
            'assigned_employee_id' => $this->employee->employee_id, 'status' => 'in_progress', 'due_at' => now()->addWeek()]);
    }

    private function url(string $suffix = ''): string
    {
        return "/api/case-files/{$this->case->id}/document-collection/{$this->document->id}".$suffix;
    }

    private function upload(): TestResponse
    {
        return $this->actingAs($this->employee, 'sanctum')->post($this->url('/received-documents'), [
            'storage_type' => 'upload', 'title' => '本人確認.pdf',
            'file' => UploadedFile::fake()->createWithContent('本人確認.pdf', "%PDF-1.4\n% Synthetic evidence\n%%EOF"),
        ], ['Accept' => 'application/json']);
    }

    public function test_owner_upload_allowlist_rejects_unsupported_files_before_storage_or_task_mutation(): void
    {
        $this->actingAs($this->employee, 'sanctum');
        foreach ([$this->url('/received-documents'), "/api/case-files/{$this->case->id}/case-tasks/{$this->task->id}/submissions"] as $url) {
            $this->post($url, ['storage_type'=>'upload','title'=>'Unsupported evidence',
                'file'=>UploadedFile::fake()->createWithContent('evidence.zip','SYNTHETIC UNSUPPORTED')], ['Accept'=>'application/json'])
                ->assertUnprocessable()->assertJsonValidationErrors('file');
        }
        $this->assertDatabaseCount('received_documents',0);$this->assertDatabaseCount('case_task_submissions',0);
        $this->assertSame('in_progress',$this->task->fresh()->status);
        $this->assertSame([],Storage::disk('local')->allFiles());
    }

    private function review(int $id, string $action, array $extra = []): TestResponse
    {
        return $this->postJson($this->url('/file-review'), ['source' => 'task_submission', 'file_id' => $id, 'action' => $action, ...$extra]);
    }

    public function test_c004_start_upload_and_confirm_keep_list_detail_and_file_in_sync(): void
    {
        $this->c004Workflow(false);
    }

    public function test_c004_return_and_reupload_keep_old_version_and_canonical_progress(): void
    {
        $this->c004Workflow(true);
    }

    private function assertCanonicalProgress(string $status, ?string $fileStatus = null): void
    {
        $list = $this->getJson("/api/case-files/{$this->case->id}/document-collection?necessity_status=required")
            ->assertOk()->assertJsonPath('documents.0.workflow_state.code', $status)->json('documents.0');
        $detail = $this->getJson($this->url())->assertOk()
            ->assertJsonPath('document.workflow_state.code', $status)->json('document');
        $this->assertSame($list['workflow_state'], $detail['workflow_state']);
        $this->assertSame($list['file_review'], $detail['file_review']);
        if ($fileStatus !== null) {
            $this->assertSame($fileStatus, $list['file_review']['status']);
        }
        $this->assertSame($status, $this->task->fresh()->status);
    }

    private function c004Workflow(bool $return): void
    {
        $type = DocumentType::create(['code' => 'C-004', 'name_ja' => '既存の事件資料一式',
            'document_group' => 'C', 'handling_type' => 'collected']);
        $this->document->update(['document_type_id' => $type->id, 'title' => $type->name_ja]);
        $this->task->update(['status' => 'unaccepted', 'title' => $type->name_ja]);
        $this->actingAs($this->employee, 'sanctum');
        $this->assertCanonicalProgress('unaccepted');
        $this->postJson("/api/case-files/{$this->case->id}/case-tasks/{$this->task->id}/accept")
            ->assertOk()->assertJsonPath('task.status', 'in_progress');
        $this->assertCanonicalProgress('in_progress');
        $first = $this->upload()->assertCreated()->json('document.file_review.id');
        $this->assertCanonicalProgress('pending_review', 'pending_review');
        $this->actingAs($this->manager, 'sanctum');
        $latest = $first;
        if ($return) {
            $this->review($first, 'return', ['reason' => '最新版が必要'])->assertOk();
            $this->assertCanonicalProgress('changes_requested', 'rejected');
            $this->assertSame('insufficient', $this->document->fresh()->fulfillment_status);
            $latest = $this->upload()->assertCreated()->json('document.file_review.id');
            $this->assertCanonicalProgress('pending_review', 'pending_review');
            $this->assertSame('undetermined', $this->document->fresh()->fulfillment_status);
            $this->assertDatabaseHas('case_task_submissions', ['id' => $first, 'version' => 1, 'review_status' => 'rejected']);
            $this->assertDatabaseHas('case_task_submissions', ['id' => $latest, 'version' => 2, 'review_status' => 'pending_review']);
            $this->actingAs($this->manager, 'sanctum');
        }
        $this->review($latest, 'confirm')->assertOk();
        $this->assertCanonicalProgress('completed', 'approved');
        $this->assertSame('satisfied', $this->document->fresh()->fulfillment_status);
        $this->assertDatabaseHas('case_activities', ['title' => 'タスクを受領']);
        $this->assertDatabaseHas('case_activities', ['title' => '資料を確認済みに変更']);
        $this->assertDatabaseHas('case_task_submissions', ['id' => $latest, 'reviewed_by' => $this->manager->id]);
    }

    public function test_confirm_persists_reviewer_time_and_one_history_event_and_reload_matches(): void
    {
        $id = $this->upload()->assertCreated()->json('document.file_review.id');
        $received = ReceivedDocument::firstOrFail();
        $this->travelTo(now()->startOfSecond());
        $this->actingAs($this->manager, 'sanctum');
        $this->review($id, 'confirm')->assertOk()
            ->assertJsonPath('document.file_review.status', 'approved')
            ->assertJsonPath('document.file_review.reviewed_by.id', $this->manager->id)
            ->assertJsonPath('document.file_review.confirmed_at', now()->toISOString())
            ->assertJsonPath('document.workflow_state.code', 'completed')
            ->assertJsonPath('document.capabilities.can_review', false);
        foreach ([CaseTaskSubmission::findOrFail($id), $received->fresh()] as $file) {
            $this->assertSame('approved', $file->review_status);
            $this->assertSame($this->manager->id, $file->reviewed_by);
            $this->assertTrue(now()->equalTo($file->reviewed_at));
        }
        $history = $this->case->activities()->where('title', '資料を確認済みに変更');
        $this->assertSame(1, $history->count());
        $this->assertSame($this->manager->id, $history->first()->metadata['actor_user_id']);
        $this->review($id, 'confirm')->assertUnprocessable()->assertJsonValidationErrors('file_id');
        $this->assertSame(1, $history->count());
        $this->getJson($this->url())->assertOk()
            ->assertJsonPath('document.file_review.status', 'approved')
            ->assertJsonPath('document.active_task.status', 'completed');
        $this->getJson("/api/case-files/{$this->case->id}/document-collection")->assertOk()
            ->assertJsonPath('documents.0.workflow_state.code', 'completed');
    }

    public function test_review_response_failure_rolls_back_file_document_task_and_history(): void
    {
        $id = $this->upload()->assertCreated()->json('document.file_review.id');
        $before = $this->case->activities()->count();
        $review = app(RequiredDocumentFileReview::class);
        $mock = $this->mock(RequiredDocumentFileReview::class);
        $mock->shouldReceive('review')->once()->andReturnUsing(fn (...$args) => $review->review(...$args));
        $mock->shouldReceive('current')->andThrow(new \RuntimeException('Simulated response serialization failure'));
        $this->actingAs($this->manager, 'sanctum');
        $this->review($id, 'confirm')->assertStatus(500);
        $submission = CaseTaskSubmission::findOrFail($id);
        $this->assertSame('pending_review', $submission->review_status);
        $this->assertNull($submission->reviewed_by);
        $this->assertNull($submission->reviewed_at);
        $this->assertSame('pending_review', ReceivedDocument::firstOrFail()->review_status);
        $this->assertSame('reviewing', $this->document->fresh()->review_status);
        $this->assertSame('pending_review', $this->task->fresh()->status);
        $this->assertSame($before, $this->case->activities()->count());
    }

    public function test_assigned_upload_enters_review_and_viewer_can_see_progress_but_cannot_act(): void
    {
        $uploaded = $this->upload()->assertCreated()->assertJsonPath('document.workflow_state.code', 'pending_review')
            ->assertJsonPath('document.file_review.status', 'pending_review')->assertJsonPath('document.capabilities.can_upload', false);
        $receivedId = $uploaded->json('document.received_documents.0.id');
        $this->assertSame('pending_review', $this->task->fresh()->status);
        $this->actingAs($this->viewer, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('document.assigned_employee.id', $this->employee->employee_id)
            ->assertJsonPath('document.active_task.status', 'pending_review')
            ->assertJsonPath('document.capabilities.can_upload', false)
            ->assertJsonPath('document.capabilities.can_review', false)
            ->assertJsonPath('document.capabilities.can_edit', false)
            ->assertJsonCount(1, 'document.task_submissions')->assertJsonMissing(['description' => 'Private task text']);
        $this->get($this->url("/received-documents/{$receivedId}/download"))->assertOk();
        $this->postJson($this->url('/received-documents'), ['storage_type' => 'external_link', 'title' => 'Other', 'external_url' => 'https://example.test/file'])->assertForbidden();
        $this->review($uploaded->json('document.file_review.id'), 'confirm')->assertForbidden();
        $this->getJson("/api/case-files/{$this->case->id}/case-tasks/{$this->task->id}")->assertForbidden();
        $this->getJson("/api/case-files/{$this->case->id}/document-collection?assignee_id={$this->employee->employee_id}")
            ->assertOk()->assertJsonCount(1, 'documents');
    }

    public function test_return_requires_reason_and_new_version_preserves_old_file_and_review_history(): void
    {
        $first = $this->upload()->assertCreated()->json('document.file_review.id');
        $file = ReceivedDocument::firstOrFail();
        $path = $file->storage_path;
        $this->actingAs($this->manager, 'sanctum');
        $this->review($first, 'return')->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->review($first, 'return', ['reason' => '   '])->assertUnprocessable();
        $this->review($first, 'return', ['reason' => '内容に不足がある', 'detail' => '裏面も提出してください。'])->assertOk()
            ->assertJsonPath('document.workflow_state.code', 'changes_requested')
            ->assertJsonPath('document.file_review.returned_by.id', $this->manager->id)
            ->assertJsonPath('document.file_review.reason', '内容に不足がある');
        $this->assertNotNull($file->fresh()->reviewed_at);
        $this->assertSame('rejected', $file->fresh()->review_status);
        $second = $this->upload()->assertCreated()->assertJsonPath('document.file_review.version', 2)
            ->assertJsonPath('document.workflow_state.code', 'pending_review')->assertJsonCount(2, 'document.received_documents')
            ->assertJsonCount(2, 'document.task_submissions')->json('document.file_review.id');
        Storage::disk('local')->assertExists($path);
        $this->assertDatabaseHas('case_task_submissions', ['id' => $first, 'version' => 1, 'review_status' => 'rejected', 'review_detail' => '裏面も提出してください。']);
        $this->actingAs($this->manager, 'sanctum');
        $this->review($first, 'confirm')->assertUnprocessable();
        $this->review($second, 'confirm')->assertOk()->assertJsonPath('document.file_review.status', 'approved')
            ->assertJsonPath('document.workflow_state.code', 'completed')
            ->assertJsonPath('document.file_review.reviewed_by.id', $this->manager->id);
        $this->assertSame('completed', $this->task->fresh()->status);
        $this->assertSame('reviewed', $this->document->fresh()->review_status);
        $this->assertNotNull(CaseTaskSubmission::find($second)->reviewed_at);
        $this->review($second, 'confirm')->assertUnprocessable();
        $this->assertDatabaseHas('case_activities', ['title' => '資料を差し戻し', 'created_by_employee_id' => $this->manager->employee_id]);
        $this->actingAs($this->viewer, 'sanctum')->getJson("/api/case-files/{$this->case->id}/workspace")
            ->assertOk()->assertJsonFragment(['title' => '資料を差し戻し'])->assertJsonFragment(['title' => 'ファイル v2 をアップロード']);
    }

    public function test_self_review_and_generic_status_bypass_are_denied_for_ordinary_assignee(): void
    {
        $id = $this->upload()->assertCreated()->json('document.file_review.id');
        $this->review($id, 'confirm')->assertForbidden();
        $this->review($id, 'return', ['reason' => 'その他'])->assertForbidden();
        $this->actingAs($this->manager, 'sanctum')->patchJson($this->url(), ['review_status' => 'reviewed'])->assertUnprocessable();
        $this->assertSame('pending_review', CaseTaskSubmission::find($id)->review_status);
    }

    public function test_unaccepted_task_cannot_upload_or_be_bypassed_by_case_update(): void
    {
        $this->task->update(['status' => 'unaccepted']);
        $this->upload()->assertForbidden();
        $this->actingAs($this->manager, 'sanctum')->postJson($this->url('/received-documents'), [
            'storage_type' => 'external_link', 'title' => 'Bypass', 'external_url' => 'https://example.test/file',
        ])->assertForbidden();
        $this->assertDatabaseCount('received_documents', 0);
    }

    public function test_unbound_received_file_uses_same_review_and_version_contract_without_creating_a_task(): void
    {
        $this->task->delete();
        $first = $this->upload()->assertCreated()->assertJsonPath('document.file_review.source', 'received')->json('document.file_review.id');
        $this->actingAs($this->manager, 'sanctum')->postJson($this->url('/file-review'), [
            'source' => 'received', 'file_id' => $first, 'action' => 'return', 'reason' => 'ファイルが不鮮明', 'detail' => '再撮影してください。',
        ])->assertOk()->assertJsonPath('document.file_review.status', 'rejected');
        $this->upload()->assertCreated()->assertJsonPath('document.file_review.version', 2);
        $this->assertDatabaseCount('case_task_submissions', 0);
        $this->assertSame(0, $this->case->caseTasks()->count());
        $this->assertDatabaseHas('received_documents', ['id' => $first, 'reviewed_by' => $this->manager->id, 'review_reason' => 'ファイルが不鮮明']);
    }

    public function test_generated_submission_stays_out_of_collected_file_review_but_existing_task_approval_works(): void
    {
        $this->task->update(['status' => 'pending_review']);
        $submission = $this->task->submissions()->create([
            'case_document_id' => $this->document->id, 'version' => 1, 'source_type' => 'auto_generated',
            'review_status' => 'pending_review', 'external_file_id' => 'generated', 'external_url' => 'https://example.test/generated.pdf',
            'filename' => 'generated.pdf', 'mime_type' => 'application/pdf', 'submitted_by' => $this->employee->id, 'submitted_at' => now(),
        ]);
        $this->actingAs($this->manager, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('document.file_review', null)->assertJsonPath('document.capabilities.can_review', false);
        $this->review($submission->id, 'confirm')->assertUnprocessable();
        $this->postJson("/api/case-files/{$this->case->id}/case-tasks/{$this->task->id}/submissions/{$submission->id}/approve")
            ->assertOk()->assertJsonPath('task.status', 'completed');
    }

    public function test_drive_submission_can_be_reviewed_from_document_and_new_task_does_not_inherit_old_completion(): void
    {
        $this->task->update(['status' => 'pending_review']);
        $submission = $this->task->submissions()->create([
            'case_document_id' => $this->document->id, 'version' => 1, 'source_type' => 'manual_upload',
            'review_status' => 'pending_review', 'external_file_id' => 'manual', 'external_url' => 'https://example.test/manual.pdf',
            'filename' => 'manual.pdf', 'mime_type' => 'application/pdf', 'submitted_by' => $this->employee->id, 'submitted_at' => now(),
        ]);
        $this->actingAs($this->manager, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('document.capabilities.can_review', true)->assertJsonPath('document.capabilities.can_return', true);
        $this->review($submission->id, 'confirm')->assertOk()->assertJsonPath('document.file_review.status', 'approved');
        $this->upload()->assertCreated()->assertJsonPath('document.file_review.version', 2)
            ->assertJsonPath('document.workflow_state.code', 'pending_review');
        $this->assertDatabaseHas('case_task_submissions', ['id' => $submission->id, 'review_status' => 'approved']);
        $this->task->update(['status' => 'cancelled']);
        $next = $this->case->caseTasks()->create(['case_document_id' => $this->document->id,
            'assigned_employee_id' => $this->employee->employee_id, 'title' => 'New task', 'status' => 'unaccepted']);
        $this->actingAs($this->manager, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('document.active_task.id', $next->id)->assertJsonPath('document.workflow_state.code', 'unaccepted')
            ->assertJsonPath('document.capabilities.can_review', false);
    }

    public function test_cross_case_file_and_review_permission_without_case_view_are_denied(): void
    {
        $id = $this->upload()->assertCreated()->json('document.file_review.id');
        $otherCase = CaseFile::create(['title' => 'Other case', 'client_id' => $this->case->client_id, 'status' => 'active']);
        $this->actingAs($this->manager, 'sanctum')->postJson("/api/case-files/{$otherCase->id}/document-collection/{$this->document->id}/file-review", [
            'source' => 'task_submission', 'file_id' => $id, 'action' => 'confirm',
        ])->assertNotFound();
        $this->review($id + 100, 'confirm')->assertUnprocessable();
        Role::where('name', 'level_4')->firstOrFail()->permissions()
            ->detach(Permission::where('name', 'case.view')->value('id'));
        $this->review($id, 'confirm')->assertForbidden();
        $this->assertDatabaseHas('case_task_submissions', ['id' => $id, 'review_status' => 'pending_review']);
    }

    public function test_existing_unreviewed_received_file_can_be_confirmed_without_fabricating_a_past_upload_or_reviewer(): void
    {
        $file = ReceivedDocument::create(['case_file_id' => $this->case->id, 'title' => 'Legacy file',
            'storage_type' => 'external_link', 'external_url' => 'https://example.test/legacy.pdf', 'version' => 1]);
        $this->document->receivedDocuments()->attach($file->id, ['relationship_type' => 'received']);
        $this->actingAs($this->manager, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('document.file_review.status', 'pending_review')->assertJsonPath('document.file_review.reviewed_by', null)
            ->assertJsonPath('document.capabilities.can_review', true)->assertJsonPath('document.workflow_state.code', 'pending_review');
        $this->patchJson($this->url(), ['review_status' => 'reviewed'])->assertUnprocessable();
        $this->postJson($this->url('/file-review'), ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])
            ->assertOk()->assertJsonPath('document.file_review.status', 'approved');
        $this->assertSame('completed', $this->task->fresh()->status);
        $this->assertDatabaseCount('case_task_submissions', 0);
        $this->assertDatabaseCount('case_activities', 1);
        $this->assertDatabaseHas('received_documents', ['id' => $file->id, 'reviewed_by' => $this->manager->id]);
    }
}
