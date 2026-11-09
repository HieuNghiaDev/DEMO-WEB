<?php

namespace Tests\Feature\B33;

use App\Models\ApprovalRequest;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentType;
use App\Models\User;
use App\Services\LegalFinalizationGate;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class C001FinalizationSecurityTest extends B21TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // No test binding or B3.1/B3.2 rehearsal: exercise the owner-approved default gate.
        $this->assertTrue(LegalFinalizationGate::policyPending());
    }

    private function context(?User $actor = null): array
    {
        $actor ??= $this->fixtureLegacy('manager', 'level_4', 'manager');
        $case = $this->matter();
        $type = DocumentType::firstOrCreate(['code' => 'C-001'], ['name_ja' => 'Synthetic C001', 'document_group' => 'C', 'handling_type' => 'office_generated']);
        $document = $case->documents()->create(['title' => 'Synthetic C001', 'document_type_id' => $type->id, 'category' => 'required']);
        $template = DocumentGenerationTemplate::firstOrCreate(['document_type_id' => $type->id, 'version' => 1],
            ['renderer_type' => 'generic_legal_document', 'format' => 'html', 'template_body' => '<article>synthetic</article>',
                'field_schema' => [['key' => 'synthetic', 'label' => 'Synthetic', 'type' => 'text', 'required' => true]], 'is_active' => true]);
        $generated = $document->generatedDocuments()->create(['document_generation_template_id' => $template->id,
            'version' => 1, 'workflow_status' => 'review', 'draft_data' => ['synthetic' => 'fixture'], 'created_by' => $actor->id]);
        foreach (['source_workbook', 'pdf'] as $kind) $generated->artifacts()->create([
            'artifact_type' => $kind, 'storage_provider' => 'google_drive', 'external_file_id' => 'synthetic-'.$kind,
            'external_url' => 'https://example.test/synthetic', 'filename' => 'synthetic.'.$kind,
            'mime_type' => $kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'uploaded_by' => $actor->id, 'uploaded_at' => now()->addSecond(),
        ]);
        return [$actor, $case, $document, $generated];
    }

    private function url($case, $document): string
    {
        return "/api/case-files/{$case->id}/document-collection/{$document->id}/creation";
    }

    public function test_level_four_cannot_final_approve_and_denial_changes_nothing(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $before = $generated->fresh()->getAttributes();
        $this->actingAs($actor, 'sanctum')->getJson($this->url($case, $document))->assertOk()
            ->assertJsonPath('permissions.can_approve', false);
        $this->getJson($this->url($case, $document))->assertJsonPath('permissions.legal_approval_pending', true);
        $this->postJson($this->url($case, $document).'/approve')->assertForbidden();
        $this->assertSame($before, $generated->fresh()->getAttributes());
        $this->assertDatabaseCount('case_activities', 0);
        $this->assertSame(0, \App\Models\SecurityAuditLog::where('event', '!=', 'authorization.request.denied')->count());
        $this->assertSame(1, \App\Models\SecurityAuditLog::where('event', 'authorization.request.denied')->count());
    }

    public function test_queue_capabilities_distinguish_legal_finalization_from_ordinary_actions(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $payloads = [
            ['case_file_id' => $case->id, 'nested' => ['case_document_id' => $document->id]],
            ['case_file_id' => $case->id, 'generated_document_id' => $generated->id],
            ['case_file_id' => $case->id, 'case_generated_document_id' => null],
            ['case_file_id' => $case->id, 'case_document_id' => 'invalid'],
        ];
        $legal = collect($payloads)->map(fn ($payload) => ApprovalRequest::create([
            'action_type' => 'review_document', 'status' => 'pending', 'payload' => $payload,
        ]));
        $ordinary = ApprovalRequest::create(['action_type' => 'delete_task', 'status' => 'pending']);
        $rows = $legal->push($ordinary);
        DB::enableQueryLog(); DB::flushQueryLog();
        $blocked = LegalFinalizationGate::pendingApprovalIds($rows);
        $this->assertCount(1, DB::getQueryLog());
        DB::disableQueryLog();
        foreach ($rows as $row) $this->assertSame(LegalFinalizationGate::blocksApproval($row), in_array($row->id, $blocked, true));
        $response = $this->actingAs($actor, 'sanctum')->getJson('/api/approvals')->assertOk();
        $byId = collect($response->json('approvals'))->keyBy('id');
        foreach ($legal->where('id', '!=', $ordinary->id) as $row) {
            if (($row->payload['case_document_id'] ?? null) === 'invalid') {
                $this->assertFalse($byId->has($row->id)); // Existing scope filter denies malformed references.
                continue;
            }
            $this->assertSame(['can_approve' => false, 'can_reject' => false, 'legal_approval_pending' => true], $byId[$row->id]['allowed_actions']);
        }
        $this->assertSame(['can_approve' => true, 'can_reject' => true, 'legal_approval_pending' => false], $byId[$ordinary->id]['allowed_actions']);
        $viewer = $this->fixtureUser('queue-viewer', ['approval.view', 'case.view']);
        $this->actingAs($viewer, 'sanctum')->getJson('/api/approvals')->assertOk()
            ->assertJsonPath('approvals.0.allowed_actions.can_approve', false)
            ->assertJsonPath('approvals.0.allowed_actions.can_reject', false);
    }

    public function test_task_capability_explains_generated_pending_but_preserves_manual_review(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        foreach (['auto_generated', 'manual_upload'] as $source) {
            $task = CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $document->id,
                'title' => 'Synthetic capability', 'status' => 'pending_review']);
            CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $document->id,
                'case_generated_document_id' => $source === 'auto_generated' ? $generated->id : null,
                'source_type' => $source, 'version' => $source === 'auto_generated' ? 1 : 2, 'review_status' => 'pending_review', 'storage_provider' => 'local',
                'external_file_id' => 'synthetic', 'external_url' => '', 'filename' => 'synthetic.pdf',
                'mime_type' => 'application/pdf', 'submitted_by' => $actor->id, 'submitted_at' => now()]);
            $actions = $task->fresh()->load('latestSubmission')->allowedActionsFor($actor);
            $this->assertSame($source === 'auto_generated', $actions['legal_approval_pending'] ?? false);
            $this->assertSame($source === 'manual_upload', $actions['can_approve']);
            $this->assertSame($source === 'manual_upload', $actions['can_reject']);
        }
    }

    public function test_queue_does_not_advertise_decisions_when_context_is_read_only(): void
    {
        [$actor] = $this->context();
        ApprovalRequest::create(['action_type' => 'delete_task', 'status' => 'pending']);
        $this->mock(\App\Services\ApprovalContextAccess::class, function ($mock) {
            $mock->shouldReceive('allows')->andReturnUsing(fn ($approval, $user, $write = false) => ! $write);
        });
        $this->actingAs($actor, 'sanctum')->getJson('/api/approvals')->assertOk()
            ->assertJsonPath('approvals.0.allowed_actions.can_approve', false)
            ->assertJsonPath('approvals.0.allowed_actions.can_reject', false);
    }

    public function test_level_five_and_explicit_legal_permission_do_not_supply_verification(): void
    {
        $admin = $this->fixtureLegacy('five', 'level_5', 'admin');
        [$actor, $case, $document, $generated] = $this->context($admin);
        $this->actingAs($actor, 'sanctum')->postJson($this->url($case, $document).'/approve')->assertForbidden();
        $explicit = $this->fixtureUser('explicit-legal', ['case.view', 'task.review', 'document.approve_legal']);
        $this->actingAs($explicit, 'sanctum')->postJson($this->url($case, $document).'/approve')
            ->assertStatus(409)->assertJsonPath('code', 'legal_authority_policy_pending');
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertNull($generated->fresh()->approved_by);
    }

    public static function decisions(): array { return [['approve'], ['reject']]; }

    #[DataProvider('decisions')]
    public function test_direct_c001_service_cannot_bypass_controller(string $decision): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        try {
            app(\App\Services\C001DocumentWorkflowService::class)->{$decision}($case, $document, $actor);
            $this->fail('Service must deny legal finalization without independent authority.');
        } catch (\Illuminate\Auth\Access\AuthorizationException) {
            $this->assertSame('review', $generated->fresh()->workflow_status);
            $this->assertNull($generated->fresh()->approved_data);
        }
    }

    public static function submissionLabels(): array { return [['auto_generated'], ['manual_upload']]; }

    #[DataProvider('submissionLabels')]
    public function test_generated_task_submission_is_not_an_internal_review_shortcut(string $label): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $task = CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $document->id, 'title' => 'Synthetic task', 'status' => 'pending_review']);
        $submission = CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $document->id,
            'case_generated_document_id' => $generated->id, 'source_type' => $label, 'version' => 1, 'review_status' => 'pending_review',
            'storage_provider' => 'local', 'external_file_id' => 'synthetic', 'external_url' => '', 'filename' => 'synthetic.pdf',
            'mime_type' => 'application/pdf', 'submitted_by' => $actor->id, 'submitted_at' => now()]);
        $before = [$generated->fresh()->getAttributes(), $task->fresh()->getAttributes(), $submission->fresh()->getAttributes()];
        $this->actingAs($actor, 'sanctum');
        foreach (['approve', 'reject'] as $decision) {
            $this->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submission->id}/{$decision}",
                ['reason' => 'Synthetic reason'])->assertForbidden();
        }
        $this->assertSame($before, [$generated->fresh()->getAttributes(), $task->fresh()->getAttributes(), $submission->fresh()->getAttributes()]);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_generic_generated_approval_denied_but_ordinary_queue_action_unchanged(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $approval = ApprovalRequest::create(['action_type' => 'review_document', 'tool_name' => 'synthetic', 'status' => 'pending',
            'payload' => ['case_file_id' => $case->id, 'nested' => ['generated_document_id' => $generated->id]]]);
        $this->actingAs($actor, 'sanctum')->patchJson('/api/approvals/'.$approval->id.'/approve')->assertForbidden();
        $this->assertSame('pending', $approval->fresh()->status);
        $ordinary = ApprovalRequest::create(['action_type' => 'delete_task', 'status' => 'pending']);
        $this->patchJson('/api/approvals/'.$ordinary->id.'/approve')->assertOk();
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->postJson('/api/approvals/'.$ordinary->id.'/execute')->assertStatus(410);
    }

    public function test_generic_nonofficial_generated_approve_and_c001_reject_are_guarded(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $generated->artifacts()->delete(); // Synthetic arrange: exercise the generic, nonofficial branch.
        config(['services.google_drive.c001_template_folder_id' => null]);
        $this->actingAs($actor, 'sanctum')->postJson($this->url($case, $document).'/approve')->assertForbidden();
        $this->postJson($this->url($case, $document).'/c001/reject', ['reason' => 'Synthetic reason'])->assertForbidden();
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertNull($generated->fresh()->approved_data);
    }

    public function test_nested_document_and_task_ids_are_denied_without_changes(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $other = $this->matter();
        $foreign = $other->documents()->create(['title' => 'Foreign synthetic document', 'category' => 'required']);
        $task = CaseTask::create(['case_file_id' => $other->id, 'case_document_id' => $foreign->id,
            'title' => 'Foreign synthetic task', 'status' => 'pending_review']);
        $submission = CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $foreign->id,
            'source_type' => 'manual_upload', 'version' => 1, 'review_status' => 'pending_review',
            'storage_provider' => 'local', 'external_file_id' => 'synthetic', 'external_url' => '', 'filename' => 'synthetic.pdf',
            'mime_type' => 'application/pdf', 'submitted_by' => $actor->id, 'submitted_at' => now()]);
        $this->actingAs($actor, 'sanctum')->postJson($this->url($case, $foreign).'/approve')->assertNotFound();
        $this->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submission->id}/approve")->assertNotFound();
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertSame('pending_review', $submission->fresh()->review_status);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_manual_internal_review_and_its_audit_rollback_remain_functional(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $task = CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $document->id,
            'title' => 'Internal synthetic task', 'status' => 'pending_review']);
        $submission = CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $document->id,
            'source_type' => 'manual_upload', 'version' => 1, 'review_status' => 'pending_review',
            'storage_provider' => 'local', 'external_file_id' => 'synthetic', 'external_url' => '', 'filename' => 'synthetic.pdf',
            'mime_type' => 'application/pdf', 'submitted_by' => $actor->id, 'submitted_at' => now()]);
        $url = "/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submission->id}/approve";
        DB::unprepared("CREATE TRIGGER b33_activity_failure BEFORE INSERT ON case_activities BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
        $this->actingAs($actor, 'sanctum')->postJson($url)->assertServerError();
        $this->assertSame('pending_review', $task->fresh()->status);
        $this->assertSame('pending_review', $submission->fresh()->review_status);
        DB::unprepared('DROP TRIGGER b33_activity_failure');
        $this->postJson($url)->assertOk();
        $this->assertSame('completed', $task->fresh()->status);
        $this->assertSame('approved', $submission->fresh()->review_status);
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertNull($generated->fresh()->approved_data);
        $this->assertDatabaseCount('case_activities', 1);
    }

    public function test_anonymous_and_canonical_admin_cannot_bypass_default_pending_gate(): void
    {
        [$actor, $case, $document, $generated] = $this->context();
        $this->getJson($this->url($case, $document))->assertUnauthorized();
        $admin = $this->fixtureUser('canonical-admin', [
            ...\Tests\Support\B21\AdminAContract::adminFixturePermissions(), 'case.view', 'task.review',
        ], 'admin');
        $this->actingAs($admin, 'sanctum')->withHeader('X-Legal-Verified', 'true')
            ->postJson($this->url($case, $document).'/approve', ['verified_lawyer' => true, 'legal_policy_pending' => false])
            ->assertForbidden();
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertNull($generated->fresh()->approved_at);
    }
}
