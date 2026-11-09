<?php

namespace Tests\Feature\B31;

use App\Models\ApprovalRequest;
use App\Models\CaseAccessDelegation;
use App\Models\CaseFile;
use App\Models\CaseMembership;
use App\Models\EmployeeNotification;
use App\Models\EmployeeTask;
use App\Models\Permission;
use App\Services\CaseAccessService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class CaseAccessBoundaryTest extends B21TestCase
{
    use \Tests\Support\B31\BuildsCaseAccessFixtures;

    public function test_schema_presence_and_client_switches_cannot_activate_default_runtime(): void
    {
        $reader = $this->reader();
        $case = $this->matter();
        $this->app->forgetInstance(CaseAccessService::class);
        $this->assertFalse($this->app->bound(CaseAccessService::class));
        $this->assertNull(CaseAccessService::rehearsal());
        $this->actingAs($reader, 'sanctum')->withHeader('X-Case-Rehearsal', 'true')
            ->getJson('/api/case-files/'.$case->id.'?case_rehearsal=1')->assertOk();
        $this->assertDatabaseCount('case_memberships', 0);
    }

    public function test_guard_and_schema_fail_before_any_mysql_connection(): void
    {
        $access = app(CaseAccessService::class);
        $migration = require database_path('migrations/2026_10_22_000000_create_rehearsal_case_access.php');
        $before = config('database.default');
        config(['database.default' => 'mysql']);
        try {
            foreach ([fn () => $access->assertSandbox(), fn () => $migration->up()] as $operation) {
                try {
                    $operation();
                    $this->fail('Guard must reject before connecting to MySQL.');
                } catch (\LogicException $error) {
                    $this->assertStringContainsString('SQLite :memory:', $error->getMessage());
                }
            }
        } finally {
            config(['database.default' => $before]);
        }
    }

    public function test_creator_shared_client_external_dashboard_and_ai_paths_are_explicitly_blocked(): void
    {
        $reader = $this->reader('pending', ['case.create', 'case.update', 'ai.use']);
        $case = $this->matter();
        $this->member($reader, $case, ['read', 'write']);
        $this->actingAs($reader, 'sanctum');
        $this->postJson('/api/case-files', [])->assertStatus(409)->assertJsonPath('code', 'case_scope_policy_pending');
        foreach (['/api/clients', '/api/clients/'.$case->client_id, '/api/visa-progress'] as $url) {
            $this->getJson($url)->assertStatus(409)->assertJsonPath('code', 'case_scope_policy_pending');
        }
        $this->postJson('/api/ai/chat', ['message' => 'Synthetic'])->assertStatus(409);
        $this->assertDatabaseCount('case_files', 1);
        $this->assertDatabaseCount('case_memberships', 1);
    }

    public static function invalidDelegations(): array
    {
        return array_map(fn ($state) => [$state], ['functional_revoke', 'missing', 'wrong_case', 'expired', 'revoked',
            'actor_inactive', 'actor_employee_inactive', 'target_inactive', 'confidential_ceiling', 'ttl_exceeded']);
    }

    #[DataProvider('invalidDelegations')]
    public function test_delegated_grant_authority_is_scoped_fresh_and_bounded(string $state): void
    {
        $case = $this->matter();
        $manager = $this->manager($case);
        $reader = $this->reader();
        $delegation = CaseAccessDelegation::sole();
        $expires = now()->addMinutes(30);
        $scopes = ['read'];
        match ($state) {
            'functional_revoke' => $manager->roles()->sole()->permissions()->detach(Permission::where('name', 'case.manage_access')->value('id')),
            'missing' => $delegation->delete(),
            'wrong_case' => $case = $this->matter(),
            'expired' => $delegation->forceFill(['expires_at' => now()->subSecond()])->save(),
            'revoked' => $delegation->forceFill(['revoked_at' => now()])->save(),
            'actor_inactive' => DB::table('users')->where('id', $manager->id)->update(['is_active' => false]),
            'actor_employee_inactive' => DB::table('employees')->where('id', $manager->employee_id)->update(['status' => 'resigned']),
            'target_inactive' => DB::table('users')->where('id', $reader->id)->update(['is_active' => false]),
            'confidential_ceiling' => [$delegation->forceFill(['grantable_scopes' => ['read']])->save(), $scopes = ['read', 'confidential']],
            'ttl_exceeded' => $expires = now()->addDays(2),
        };
        try {
            app(CaseAccessService::class)->grant($manager, $case->id, $reader, $scopes, $expires);
            $this->fail('Delegation failure must deny the grant: '.$state);
        } catch (AuthorizationException) {
            $this->assertDatabaseCount('case_memberships', 0);
        }
    }

    public function test_canonical_admin_can_manage_delegated_membership_without_confidential_content_access(): void
    {
        $case = $this->matter();
        $case->forceFill(['is_confidential' => true])->save();
        $admin = $this->manager($case, ['read', 'confidential'], true);
        $reader = $this->reader();
        $this->actingAs($admin, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertNotFound();
        app(CaseAccessService::class)->grant($admin, $case->id, $reader, ['read', 'confidential'], now()->addMinutes(30));
        $this->assertFalse(app(CaseAccessService::class)->allows($admin, $case->id));
        $this->actingAs($reader, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertOk();
    }

    public function test_read_only_membership_has_no_mutation_capabilities_in_document_or_task_response(): void
    {
        $reader = $this->reader('read-flags', ['case.update', 'task.update', 'task.manage', 'task.review']);
        $case = $this->matter();
        $doc = $this->document($case);
        $task = $case->caseTasks()->create(['title' => 'Synthetic task', 'assigned_employee_id' => $reader->employee_id,
            'case_document_id' => $doc->id, 'status' => 'unaccepted']);
        $this->member($reader, $case);
        $this->actingAs($reader, 'sanctum');
        $response = $this->getJson('/api/case-files/'.$case->id.'/document-collection/'.$doc->id)->assertOk();
        foreach ($response->json('document.capabilities') as $capability) $this->assertFalse($capability);
        $this->getJson('/api/case-files/'.$case->id.'/case-tasks/'.$task->id)->assertOk()->assertJsonPath('task.allowed_actions.can_accept', false);
        $this->postJson('/api/case-files/'.$case->id.'/case-tasks/'.$task->id.'/accept')->assertForbidden();
    }

    public function test_revoke_removes_pdf_history_approval_and_notification_access_on_same_bearer(): void
    {
        $reader = $this->reader('revoke-files', ['approval.view']);
        $case = $this->matter();
        $doc = $this->document($case);
        $manager = $this->manager($case);
        $this->member($reader, $case);
        $approval = ApprovalRequest::create(['action_type' => 'synthetic', 'tool_name' => 'synthetic', 'requested_by' => $reader->id,
            'payload' => ['case_document_id' => $doc->id], 'status' => 'pending']);
        EmployeeNotification::create(['user_id' => $reader->id, 'kind' => 'info', 'title' => 'Synthetic notice',
            'message' => 'Synthetic private detail', 'data' => ['approval_id' => $approval->id, 'target_path' => '/approvals']]);
        $this->mock(\App\Services\C001DocumentWorkflowService::class)->shouldReceive('previewPdf')->once()
            ->andReturn(['bytes' => '%PDF-SYNTHETIC', 'version' => 1, 'source' => 'synthetic']);
        $token = $reader->createToken('synthetic-file-revoke')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $prefix = '/api/case-files/'.$case->id;
        $pdf = $prefix.'/document-collection/'.$doc->id.'/creation/c001/preview';
        $this->withToken($token)->get($pdf)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->getJson('/api/approvals')->assertOk()->assertJsonCount(1, 'approvals');
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'notifications');
        app(CaseAccessService::class)->revoke($manager, $case->id, $reader);
        foreach ([$pdf, $prefix.'/history', $prefix.'/document-collection/'.$doc->id] as $url) $this->getJson($url)->assertNotFound();
        $this->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'approvals');
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'notifications');
    }

    public function test_linked_legacy_task_direct_id_requires_case_scope_but_unlinked_tasks_still_work(): void
    {
        $reader = $this->reader('legacy-direct', ['task.view_own', 'task.update']);
        $case = $this->matter();
        $doc = $this->document($case);
        $task = EmployeeTask::create(['employee_id' => $reader->employee_id, 'assigned_by' => $reader->id,
            'case_document_id' => $doc->id, 'title' => 'Synthetic linked task', 'duration_minutes' => 30, 'status' => 'pending']);
        EmployeeTask::create(['employee_id' => $reader->employee_id, 'assigned_by' => $reader->id,
            'title' => 'Synthetic ordinary task', 'duration_minutes' => 30, 'status' => 'pending']);
        $this->actingAs($reader, 'sanctum')->getJson('/api/my/tasks')->assertOk()->assertJsonCount(1, 'tasks');
        $this->patchJson('/api/tasks/'.$task->id.'/accept')->assertNotFound();
        $this->member($reader, $case, ['read', 'write']);
        $this->patchJson('/api/tasks/'.$task->id.'/accept')->assertOk()->assertJsonPath('task.status', 'accepted');
    }

    public function test_opaque_approval_and_notification_records_fail_closed_without_provenance(): void
    {
        $reader = $this->reader('opaque', ['approval.view', 'approval.approve']);
        $approval = ApprovalRequest::create(['action_type' => 'synthetic', 'tool_name' => 'synthetic', 'requested_by' => $reader->id,
            'payload' => ['unmapped_case_id' => 999, 'text' => 'SYNTHETIC CONFIDENTIAL'], 'status' => 'pending']);
        $notice = EmployeeNotification::create(['user_id' => $reader->id, 'kind' => 'info', 'title' => 'SYNTHETIC CONFIDENTIAL',
            'message' => 'Synthetic', 'data' => []]);
        $this->actingAs($reader, 'sanctum')->getJson('/api/approvals')->assertOk()->assertJsonCount(0, 'approvals');
        $this->postJson('/api/approvals/'.$approval->id.'/execute')->assertForbidden();
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'notifications');
        $this->patchJson('/api/notifications/read-all')->assertOk();
        $this->assertNull($notice->fresh()->read_at);
    }

    public function test_content_membership_is_not_final_legal_approval_authority(): void
    {
        $reader = $this->reader('legal-boundary', ['case.update', 'task.review']);
        $case = $this->matter();
        $doc = $this->document($case);
        $this->member($reader, $case, ['read', 'write', 'confidential']);
        $this->actingAs($reader, 'sanctum')->postJson('/api/case-files/'.$case->id.'/document-collection/'.$doc->id.'/creation/approve')
            ->assertStatus(409)->assertJsonPath('code', 'legal_authority_policy_pending');
        $this->assertFalse($reader->hasPermission('document.approve_legal'));
        $this->assertDatabaseCount('case_generated_documents', 0);
    }

    public function test_membership_query_cost_does_not_scale_per_inaccessible_case(): void
    {
        $reader = $this->reader('scaling');
        $own = $this->matter();
        $this->member($reader, $own);
        $this->actingAs($reader, 'sanctum');
        $counts = [];
        foreach ([1, 31, 101] as $size) {
            while (CaseFile::count() < $size) $this->matter();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $response = $this->getJson('/api/case-files');
            $counts[] = count(DB::getQueryLog());
            DB::disableQueryLog();
            $response->assertOk()->assertJsonCount(1, 'case_files')->assertJsonPath('case_files.0.id', $own->id);
        }
        $this->assertLessThanOrEqual(2, max($counts) - min($counts));
    }

    public function test_guest_is_denied_before_case_content_is_disclosed(): void
    {
        $case = $this->matter();
        $this->getJson('/api/case-files/'.$case->id)->assertUnauthorized();
    }

    public function test_stale_presentation_snapshot_cannot_authorize_service_mutations_after_revoke(): void
    {
        $reader = $this->reader('service-fence', ['case.update', 'task.manage', 'task.review']);
        $case = $this->matter();
        $doc = $this->document($case);
        $task = $case->caseTasks()->create(['title' => 'Synthetic fenced task', 'case_document_id' => $doc->id,
            'assigned_employee_id' => $reader->employee_id, 'status' => 'unaccepted']);
        $member = $this->member($reader, $case, ['read', 'write']);
        $this->actingAs($reader, 'sanctum')->getJson('/api/case-files/'.$case->id.'/case-tasks/'.$task->id)->assertOk();
        $member->forceFill(['revoked_at' => now()])->save();
        request()->attributes->set('b31_case_presentation', ['user_id' => $reader->id, 'case_id' => $case->id, 'write' => true]);
        $operations = [
            fn () => app(\App\Services\CaseTaskWorkflowService::class)->manage($case, $task, request(), ['description' => 'MUST NOT COMMIT']),
            fn () => app(\App\Services\CaseTaskService::class)->createStandalone($case, request(), ['title' => 'MUST NOT COMMIT']),
            fn () => app(\App\Services\RequiredDocumentFileReview::class)->review($case, $doc, request(), ['source' => 'received', 'file_id' => 1, 'action' => 'confirm']),
        ];
        foreach ($operations as $operation) {
            try {
                $operation();
                $this->fail('Service must reauthorize instead of trusting response flags.');
            } catch (AuthorizationException) {
                $this->assertNull($task->fresh()->description);
                $this->assertDatabaseCount('case_tasks', 1);
            }
        }
    }

    public function test_narrow_delegation_cannot_overwrite_or_revoke_a_broader_membership(): void
    {
        $case = $this->matter();
        $manager = $this->manager($case, ['read']);
        $reader = $this->reader();
        $member = $this->member($reader, $case, ['read', 'write', 'confidential']);
        $before = $member->fresh()->getAttributes();
        $access = app(CaseAccessService::class);
        foreach ([fn () => $access->grant($manager, $case->id, $reader, ['read'], now()->addMinutes(30)),
            fn () => $access->revoke($manager, $case->id, $reader)] as $operation) {
            try {
                $operation();
                $this->fail('Narrow delegation must not mutate a broader grant.');
            } catch (AuthorizationException) {
                $this->assertSame($before, $member->fresh()->getAttributes());
            }
        }
    }

    public function test_cross_connection_identity_is_refused_before_resolving_a_foreign_connection(): void
    {
        $reader = $this->reader('connection-fence');
        $case = $this->matter();
        $reader->setConnection('mysql'); // Model metadata only; do NOT resolve/connect this name.
        $this->assertArrayNotHasKey('mysql', DB::getConnections());
        try {
            app(CaseAccessService::class)->allows($reader, $case->id);
            $this->fail('A foreign model connection must fail before fresh()/SQL.');
        } catch (\LogicException $error) {
            $this->assertSame('Case access refuses a cross-connection identity.', $error->getMessage());
            $this->assertArrayNotHasKey('mysql', DB::getConnections());
        }
    }

    public function test_malformed_submission_ids_cannot_crash_or_bypass_the_parent_guard(): void
    {
        $reader = $this->reader('malformed-file', ['task.review']);
        $case = $this->matter();
        $doc = $this->document($case);
        $this->member($reader, $case, ['read', 'write']);
        $this->actingAs($reader, 'sanctum');
        foreach ([[1], null, '1.0', -1] as $id) {
            $this->postJson('/api/case-files/'.$case->id.'/document-collection/'.$doc->id.'/file-review',
                ['source' => 'task_submission', 'file_id' => $id, 'action' => 'confirm'])->assertNotFound();
        }
    }

    public function test_manual_label_cannot_bypass_pending_legal_policy_for_a_generated_document_link(): void
    {
        $reader = $this->reader('linked-generated', ['task.review']);
        $case = $this->matter();
        $doc = $this->document($case);
        $this->member($reader, $case, ['read', 'write']);
        $type = \App\Models\DocumentType::create(['code' => 'B31-GEN', 'name_ja' => 'Synthetic generated',
            'document_group' => 'C', 'handling_type' => 'office_generated']);
        $template = \App\Models\DocumentGenerationTemplate::create(['document_type_id' => $type->id, 'version' => 1,
            'renderer_type' => 'generic', 'format' => 'html', 'template_body' => 'Synthetic', 'field_schema' => []]);
        $generated = \App\Models\CaseGeneratedDocument::create(['case_document_id' => $doc->id,
            'document_generation_template_id' => $template->id, 'version' => 1, 'workflow_status' => 'review', 'draft_data' => []]);
        $task = $case->caseTasks()->create(['title' => 'Synthetic generated review', 'case_document_id' => $doc->id,
            'assigned_employee_id' => $reader->employee_id, 'status' => 'pending_review']);
        $submission = \App\Models\CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $doc->id,
            'case_generated_document_id' => $generated->id, 'version' => 1, 'source_type' => 'manual_upload',
            'review_status' => 'pending_review', 'storage_provider' => 'local', 'external_file_id' => 'synthetic',
            'external_url' => '', 'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf', 'submitted_at' => now()]);
        $this->actingAs($reader, 'sanctum')->postJson('/api/case-files/'.$case->id.'/case-tasks/'.$task->id.'/submissions/'.$submission->id.'/approve')
            ->assertStatus(409)->assertJsonPath('code', 'legal_authority_policy_pending');
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertSame('pending_review', $task->fresh()->status);
    }
}
