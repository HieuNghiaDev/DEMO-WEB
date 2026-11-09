<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\CaseActivity;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentType;
use App\Models\EmployeeNotification;
use App\Models\Permission;
use App\Models\ReceivedDocument;
use App\Models\Role;
use App\Models\User;
use App\Services\ApprovalNotificationService;
use App\Services\CaseTaskWorkflowService;
use App\Services\RequiredDocumentFileReview;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\SecurityRemediationTestCase;

class Phase3B1SecurityTest extends SecurityRemediationTestCase
{
    public function test_guest_cannot_review_or_read_queue(): void
    {
        [$case, $task, $submission] = $this->submission();
        $this->getJson('/api/approvals')->assertUnauthorized();
        foreach (['approve', 'reject'] as $action) {
            $this->postJson($this->url($case, $task, $submission, $action), ['reason' => 'Synthetic reason'])->assertUnauthorized();
        }
    }

    public function test_task_review_without_case_view_cannot_approve_or_reject(): void
    {
        $reviewer = $this->withPermissions('review-only', ['task.review']);
        [$case, $task, $submission] = $this->submission();
        $before = [$task->fresh()->getAttributes(), $submission->fresh()->getAttributes(), CaseActivity::count(), EmployeeNotification::count()];
        foreach (['approve', 'reject'] as $action) {
            $this->actingAs($reviewer, 'sanctum')->postJson($this->url($case, $task, $submission, $action), ['reason' => 'Synthetic reason'])
                ->assertForbidden()->assertDontSee('SYNTHETIC PRIVATE TASK');
        }
        $this->assertSame($before, [$task->fresh()->getAttributes(), $submission->fresh()->getAttributes(), CaseActivity::count(), EmployeeNotification::count()]);
    }

    public function test_case_view_without_review_cannot_review(): void
    {
        $viewer = $this->withPermissions('viewer', ['case.view']);
        [$case, $task, $submission] = $this->submission();
        $this->actingAs($viewer, 'sanctum')->postJson($this->url($case, $task, $submission, 'approve'))->assertForbidden();
        $this->assertSame('pending_review', $submission->fresh()->review_status);
    }

    public function test_valid_case_reviewer_can_approve_without_reading_private_task(): void
    {
        $this->reviewPrivateTask('approve', 'completed');
    }

    public function test_valid_case_reviewer_can_reject_without_reading_private_task(): void
    {
        $this->reviewPrivateTask('reject', 'changes_requested');
    }

    public function test_reviewer_with_task_visibility_keeps_full_response(): void
    {
        $reviewer = $this->withPermissions('full-reviewer', ['case.view', 'task.review', 'task.view_all']);
        [$case, $task, $submission] = $this->submission();
        $this->actingAs($reviewer, 'sanctum')->postJson($this->url($case, $task, $submission, 'approve'))
            ->assertOk()->assertJsonPath('task.id', $task->id)->assertJsonPath('task.description', 'SYNTHETIC PRIVATE TASK');
        $this->assertSame($reviewer->id, $submission->fresh()->reviewed_by);
    }

    public function test_wrong_case_task_and_submission_are_rejected_without_changes(): void
    {
        $reviewer = $this->withPermissions('cross-reviewer', ['case.view', 'task.review']);
        [$case, $task, $submission] = $this->submission();
        [$otherCase, , $otherSubmission] = $this->submission('other');
        $this->actingAs($reviewer, 'sanctum')->postJson($this->url($otherCase, $task, $submission, 'approve'))->assertNotFound();
        $this->postJson($this->url($case, $task, $otherSubmission, 'reject'), ['reason' => 'Synthetic reason'])->assertNotFound();
        $this->assertSame('pending_review', $submission->fresh()->review_status);
        $this->assertSame('pending_review', $otherSubmission->fresh()->review_status);
    }

    public function test_direct_workflow_review_cannot_bypass_case_permission(): void
    {
        $reviewer = $this->withPermissions('service-reviewer', ['task.review']);
        [$case, $task, $submission] = $this->submission();
        $request = Request::create('/', 'POST');
        $request->setUserResolver(fn () => $reviewer);
        try {
            app(CaseTaskWorkflowService::class)->approve($case, $task, $submission, $request);
            $this->fail('Workflow must enforce case access independently of route middleware.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        $this->assertSame('pending_review', $submission->fresh()->review_status);
    }

    public function test_direct_received_review_cannot_bind_document_from_another_case(): void
    {
        $reviewer = $this->withPermissions('received-reviewer', ['case.view', 'task.review']);
        [$case] = $this->submission();
        $otherCase = $this->matter();
        $document = $otherCase->documents()->create(['title' => 'Synthetic received', 'category' => 'COMMON', 'review_status' => 'reviewing']);
        $file = ReceivedDocument::create(['case_file_id' => $otherCase->id, 'title' => 'Synthetic received',
            'storage_type' => 'external_link', 'external_url' => 'https://example.test/file', 'version' => 1, 'review_status' => 'pending_review']);
        $document->receivedDocuments()->attach($file->id, ['relationship_type' => 'received']);
        $request = Request::create('/', 'POST');
        $request->setUserResolver(fn () => $reviewer);
        try {
            app(RequiredDocumentFileReview::class)->review($case, $document, $request, [
                'source' => 'received', 'file_id' => $file->id, 'action' => 'confirm',
            ]);
            $this->fail('Document must belong to the supplied case.');
        } catch (ModelNotFoundException $error) {
            $this->assertSame(\App\Models\CaseDocument::class, $error->getModel());
        } catch (HttpException $error) {
            $this->assertSame(404, $error->getStatusCode());
        }
        $this->assertNotSame($case->id, $otherCase->id);
        $this->assertSame('pending_review', $file->fresh()->review_status);
    }

    public function test_deleted_case_is_not_reviewable_or_queued(): void
    {
        $reviewer = $this->withPermissions('deleted-case', ['case.view', 'task.review', 'approval.view']);
        [$case, $task, $submission] = $this->submission();
        $this->officialDocument($case, $reviewer);
        $case->delete();
        $this->actingAs($reviewer, 'sanctum')->postJson($this->url($case, $task, $submission, 'approve'))->assertNotFound();
        $this->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'c001_documents');
    }

    public function test_approval_view_alone_never_exposes_case_metadata(): void
    {
        $viewer = $this->withPermissions('queue-viewer', ['approval.view']);
        $this->officialDocument($this->matter(), $viewer);
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()
            ->assertJsonCount(0, 'c001_documents')->assertDontSee('SYNTHETIC PRIVATE CLIENT');
    }

    public function test_authorized_queue_preserves_case_metadata_and_versions(): void
    {
        $viewer = $this->withPermissions('queue-case-viewer', ['approval.view', 'case.view']);
        $case = $this->matter();
        $this->officialDocument($case, $viewer);
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()
            ->assertJsonCount(1, 'c001_documents')->assertJsonPath('c001_documents.0.case_id', $case->id)
            ->assertJsonPath('c001_documents.0.client_name', 'SYNTHETIC PRIVATE CLIENT');
    }

    public function test_revoking_case_view_hides_queue_on_same_bearer(): void
    {
        $viewer = $this->withPermissions('revoked-queue', ['approval.view', 'case.view']);
        $this->officialDocument($this->matter(), $viewer);
        $token = $viewer->createToken('synthetic-b1', ['*'], now()->addHour())->plainTextToken;
        $this->withToken($token)->getJson('/api/approvals')->assertOk()->assertJsonCount(1, 'c001_documents');
        $viewer->roles()->first()->permissions()->detach(Permission::where('name', 'case.view')->value('id'));
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'c001_documents');
        $this->assertSame(1, $viewer->tokens()->count());
    }

    public function test_case_linked_general_approvals_filter_before_limit_and_transition(): void
    {
        $viewer = $this->withPermissions('general-viewer', ['approval.view', 'approval.approve']);
        $case = $this->matter();
        $visible = ApprovalRequest::create(['action_type' => 'general', 'status' => 'pending', 'payload' => ['subject' => 'Synthetic ordinary request']]);
        for ($index = 0; $index < 101; $index++) {
            $hidden = ApprovalRequest::create(['action_type' => 'case_review', 'status' => 'pending',
                'payload' => ['context' => ['case_file_id' => $case->id, 'client_name' => 'SYNTHETIC PRIVATE CLIENT']]]);
        }
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()
            ->assertJsonCount(1, 'approvals')->assertJsonPath('approvals.0.id', $visible->id)
            ->assertDontSee('SYNTHETIC PRIVATE CLIENT');
        foreach (['approve', 'reject'] as $action) {
            $this->patchJson("/api/approvals/{$hidden->id}/{$action}")->assertForbidden()->assertDontSee('SYNTHETIC PRIVATE CLIENT');
        }
        $this->assertSame('pending', $hidden->fresh()->status);
        $this->patchJson("/api/approvals/{$visible->id}/approve")->assertOk();
    }

    public function test_document_and_task_references_do_not_bypass_queue_scope(): void
    {
        $viewer = $this->withPermissions('reference-viewer', ['approval.view', 'approval.approve']);
        [$case, $task] = $this->submission();
        foreach ([['case_id' => $case->id], ['case_document_id' => $task->case_document_id], ['case_task_id' => $task->id], ['case_file_id' => 'not-an-id']] as $payload) {
            ApprovalRequest::create(['action_type' => 'case_review', 'status' => 'pending', 'payload' => $payload]);
        }
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'approvals');
    }

    public function test_case_viewer_cannot_read_private_task_through_general_queue(): void
    {
        $viewer = $this->withPermissions('private-queue', ['case.view', 'approval.view', 'approval.approve']);
        [, $task] = $this->submission();
        $approval = ApprovalRequest::create(['action_type' => 'case_review', 'status' => 'pending',
            'payload' => ['case_task_id' => $task->id, 'description' => 'SYNTHETIC PRIVATE TASK']]);
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'approvals');
        $this->patchJson("/api/approvals/{$approval->id}/approve")->assertForbidden();
    }

    public function test_approval_notifications_respect_linked_case_access(): void
    {
        $outside = $this->withPermissions('notify-outside', ['approval.approve']);
        $inside = $this->withPermissions('notify-inside', ['approval.approve', 'case.view']);
        $approval = ApprovalRequest::create(['action_type' => 'case_review', 'status' => 'pending', 'payload' => ['case_file_id' => $this->matter()->id]]);
        app(ApprovalNotificationService::class)->notify($approval);
        $this->assertFalse(EmployeeNotification::where('user_id', $outside->id)->exists());
        $this->assertTrue(EmployeeNotification::where('user_id', $inside->id)->exists());
    }

    public function test_unknown_permissions_denied_for_pivot_and_legacy_admins(): void
    {
        foreach (['level_1', 'level_4', 'level_5'] as $role) {
            $user = $this->actor('unknown-'.$role, $role);
            foreach (['', '*', 'case.view ', 'case.VIEW', 'synthetic.nonexistent', 'developer.unknown'] as $name) {
                $this->assertFalse($user->hasPermission($name), $role.' / '.$name);
            }
        }
        $legacy = $this->actor('unknown-legacy', 'level_1');
        $legacy->update(['role' => 'admin']);
        $this->assertFalse($legacy->hasPermission('synthetic.nonexistent'));
        // A03: the legacy display column cannot supply a missing administration pivot.
        $this->assertFalse($legacy->hasPermission('employee.manage_roles'));
        $this->assertFalse($legacy->hasPermission('developer.view'));
    }

    public function test_existing_catalog_permissions_and_role_pivots_are_not_rewritten(): void
    {
        foreach (['level_1' => 7, 'level_2' => 10, 'level_3' => 14, 'level_4' => 32, 'level_5' => 32, 'developer' => 12] as $role => $count) {
            $user = $this->actor('preserve-'.$role, $role);
            $before = $user->fresh()->getAttributes();
            $permissions = $user->roles()->first()->permissions()->pluck('name')->all();
            $this->assertCount($count, $permissions);
            foreach ($permissions as $permission) $this->assertTrue($user->hasPermission($permission));
            $this->assertFalse($user->hasPermission('synthetic.nonexistent'));
            $this->assertSame($before, $user->fresh()->getAttributes());
            $this->assertSame([$role], $user->roles()->pluck('name')->all());
        }
    }

    public function test_invalid_catalog_names_never_turn_into_admin_grants(): void
    {
        $admin = $this->actor('invalid-catalog', 'level_5');
        foreach (['*', 'case..view', 'case.view ', 'case.VIEW'] as $name) {
            Permission::create(['name' => $name, 'display_name' => 'Synthetic invalid entry']);
            $this->assertFalse($admin->hasPermission($name));
            $this->assertNotContains($name, $admin->permission_names);
        }
        $this->assertTrue($admin->hasPermission('employee.manage_roles'));
    }

    public function test_generated_and_received_review_routes_require_case_view_before_workflow(): void
    {
        $reviewer = $this->withPermissions('document-review-only', ['task.review']);
        [$case, $task, $submission] = $this->submission();
        $url = "/api/case-files/{$case->id}/document-collection/{$task->case_document_id}";
        $this->actingAs($reviewer, 'sanctum')->postJson($url.'/creation/approve')->assertForbidden();
        $this->postJson($url.'/creation/c001/reject', ['reason' => 'Synthetic reason'])->assertForbidden();
        $this->postJson($url.'/file-review', ['source' => 'task_submission', 'file_id' => $submission->id, 'action' => 'confirm'])->assertForbidden();
        $this->assertSame('pending_review', $submission->fresh()->review_status);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_revoking_case_view_denies_review_with_same_bearer_and_no_state_change(): void
    {
        $reviewer = $this->withPermissions('revoked-review', ['case.view', 'task.review']);
        [$case, $task, $submission] = $this->submission();
        $token = $reviewer->createToken('synthetic-review', ['*'], now()->addHour())->plainTextToken;
        $this->withToken($token)->getJson("/api/case-files/{$case->id}")->assertOk();
        $reviewer->roles()->first()->permissions()->detach(Permission::where('name', 'case.view')->value('id'));
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson($this->url($case, $task, $submission, 'approve'))->assertForbidden();
        $this->assertSame('pending_review', $submission->fresh()->review_status);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_processed_approval_does_not_leak_status_after_scope_is_lost(): void
    {
        $viewer = $this->withPermissions('processed-outside', ['approval.approve']);
        $approval = ApprovalRequest::create(['action_type' => 'case_review', 'status' => 'approved', 'payload' => ['case_file_id' => $this->matter()->id]]);
        $this->actingAs($viewer, 'sanctum')->patchJson("/api/approvals/{$approval->id}/reject")
            ->assertForbidden()->assertJsonMissingPath('current_status');
    }

    public function test_valid_general_case_approval_and_deleted_case_queue(): void
    {
        $viewer = $this->withPermissions('valid-general', ['case.view', 'approval.view', 'approval.approve']);
        $case = $this->matter();
        $approval = ApprovalRequest::create(['action_type' => 'case_review', 'status' => 'pending', 'payload' => ['case_file_id' => $case->id]]);
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()->assertJsonCount(1, 'approvals');
        $this->patchJson("/api/approvals/{$approval->id}/approve")->assertOk()->assertJsonPath('approval.approved_by.id', $viewer->id);
        $case->delete();
        $this->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'approvals');
        $this->patchJson("/api/approvals/{$approval->id}/reject")->assertForbidden();
    }

    public function test_submission_notification_does_not_leak_private_task_or_cross_case_gate(): void
    {
        $outside = $this->withPermissions('task-notify-outside', ['task.review']);
        $inside = $this->withPermissions('task-notify-inside', ['task.review', 'case.view']);
        [$case, $task] = $this->submission();
        $task->submissions()->delete();
        $task->update(['status' => 'in_progress', 'title' => 'SYNTHETIC PRIVATE TASK TITLE']);
        $document = $task->caseDocument;
        $file = ReceivedDocument::create(['case_file_id' => $case->id, 'title' => 'Synthetic file', 'storage_type' => 'external_link',
            'external_url' => 'https://example.test/file', 'version' => 2, 'review_status' => 'pending_review']);
        $document->receivedDocuments()->attach($file->id, ['relationship_type' => 'received']);
        $request = Request::create('/', 'POST');
        $request->setUserResolver(fn () => $inside);
        $this->assertTrue(app(CaseTaskWorkflowService::class)->submitReceived($case, $document, $file, $request, 'application/pdf'));
        $this->assertFalse(EmployeeNotification::where('user_id', $outside->id)->exists());
        $notification = EmployeeNotification::where('user_id', $inside->id)->sole();
        $this->assertStringNotContainsString('SYNTHETIC PRIVATE TASK', $notification->message);
        $this->assertArrayNotHasKey('case_task_id', $notification->data);
        $this->assertSame($document->id, $notification->data['case_document_id']);
    }

    private function reviewPrivateTask(string $action, string $status): void
    {
        $reviewer = $this->withPermissions('private-'.$action, ['case.view', 'task.review']);
        [$case, $task, $submission] = $this->submission();
        $this->assertFalse($task->isVisibleTo($reviewer));
        $this->actingAs($reviewer, 'sanctum')->postJson($this->url($case, $task, $submission, $action), ['reason' => 'Synthetic reason'])
            ->assertOk()->assertJsonPath('task', null)->assertDontSee('SYNTHETIC PRIVATE TASK');
        $this->assertSame($status, $task->fresh()->status);
        $this->assertSame($reviewer->id, $submission->fresh()->reviewed_by);
    }

    private function withPermissions(string $suffix, array $permissions): User
    {
        $user = $this->actor($suffix, null);
        $role = Role::create(['name' => 'b1-'.$suffix, 'display_name' => 'Synthetic B1']);
        $role->permissions()->sync(Permission::whereIn('name', $permissions)->pluck('id'));
        $user->roles()->sync([$role->id]);
        return $user;
    }

    private function submission(string $suffix = 'owner'): array
    {
        $owner = $this->actor($suffix, 'level_2');
        $case = $this->matter($owner->employee);
        $document = $case->documents()->create(['title' => 'Synthetic document', 'category' => 'COMMON', 'review_status' => 'reviewing']);
        $task = $case->caseTasks()->create(['case_document_id' => $document->id, 'assigned_employee_id' => $owner->employee_id,
            'title' => 'Synthetic task', 'description' => 'SYNTHETIC PRIVATE TASK', 'status' => 'pending_review']);
        $submission = $task->submissions()->create(['case_document_id' => $document->id, 'version' => 1, 'source_type' => 'manual_upload',
            'review_status' => 'pending_review', 'storage_provider' => 'local_file', 'external_file_id' => 'synthetic', 'external_url' => '',
            'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf', 'submitted_by' => $owner->id, 'submitted_at' => now()]);
        return [$case, $task, $submission];
    }

    private function url(CaseFile $case, CaseTask $task, CaseTaskSubmission $submission, string $action): string
    {
        return "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submission->id}/{$action}";
    }

    private function officialDocument(CaseFile $case, User $actor): void
    {
        $case->client->update(['name' => 'SYNTHETIC PRIVATE CLIENT']);
        $type = DocumentType::firstOrCreate(['code' => 'C-001'], ['name_ja' => 'Synthetic C-001', 'document_group' => 'C', 'version' => 1, 'is_active' => true]);
        $template = DocumentGenerationTemplate::create(['document_type_id' => $type->id, 'version' => 1,
            'renderer_type' => 'generic_legal_document', 'format' => 'html', 'template_body' => '<article>Synthetic</article>', 'field_schema' => [], 'is_active' => true]);
        $document = $case->documents()->create(['title' => 'Synthetic C-001', 'category' => 'COMMON', 'document_type_id' => $type->id]);
        $instance = $document->generatedDocuments()->create(['document_generation_template_id' => $template->id, 'version' => 1,
            'workflow_status' => 'review', 'draft_data' => [], 'created_by' => $actor->id]);
        foreach (['source_workbook', 'pdf'] as $kind) {
            $instance->artifacts()->create(['artifact_type' => $kind, 'storage_provider' => 'google_drive',
                'external_file_id' => 'synthetic-'.$kind, 'filename' => 'synthetic-'.$kind, 'external_url' => 'https://example.test/'.$kind,
                'mime_type' => 'application/octet-stream', 'uploaded_at' => now(), 'uploaded_by' => $actor->id]);
        }
    }
}
