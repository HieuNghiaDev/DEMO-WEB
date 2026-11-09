<?php

namespace Tests\Feature\B31;

use App\Models\ApprovalRequest;
use App\Models\CaseAccessDelegation;
use App\Models\CaseActivity;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseMembership;
use App\Models\CaseTask;
use App\Models\EmployeeNotification;
use App\Models\EmployeeTask;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\CaseAccessService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class CaseMembershipAccessTest extends B21TestCase
{
    use \Tests\Support\B31\BuildsCaseAccessFixtures;

    public function test_functional_permission_creator_assignee_and_level_are_not_membership(): void
    {
        $reader = $this->reader();
        $case = $this->matter($reader->employee);
        $this->actingAs($reader, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $legacy = $this->fixtureLegacy('b31-level-five', 'level_5', 'admin');
        $this->assertTrue($legacy->hasPermission('case.view'));
        $this->actingAs($legacy, 'sanctum')->getJson('/api/case-files/'.$case->id.'/workspace')->assertNotFound();
        $this->member($reader, $case);
        $this->actingAs($reader, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertOk();
    }

    public function test_canonical_admin_without_content_membership_cannot_read_confidential_case(): void
    {
        $admin = $this->fixtureAdmin('b31-admin');
        $case = $this->matter();
        $case->forceFill(['is_confidential' => true])->save();
        $this->actingAs($admin, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertNotFound();
    }

    public function test_confidential_scope_and_functional_grant_are_both_required(): void
    {
        $reader = $this->reader();
        $case = $this->matter();
        $case->forceFill(['is_confidential' => true])->save();
        $membership = $this->member($reader, $case);
        $this->actingAs($reader, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $membership->forceFill(['can_read_confidential' => true])->save();
        $this->getJson('/api/case-files/'.$case->id)->assertOk();
        $reader->roles()->sole()->permissions()->detach(\App\Models\Permission::where('name', 'case.view')->value('id'));
        $this->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $this->assertFalse(app(CaseAccessService::class)->allows($reader, $case->id));
    }

    public function test_grant_revoke_are_immediate_on_same_bearer_and_create_required_audit(): void
    {
        $reader = $this->reader();
        $case = $this->matter();
        $manager = $this->manager($case);
        $access = app(CaseAccessService::class);
        $this->assertFalse($access->allows($manager, $case->id));
        $token = $reader->createToken('synthetic-case-membership')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $access->grant($manager, $case->id, $reader, ['read'], now()->addMinutes(30));
        $this->getJson('/api/case-files/'.$case->id)->assertOk();
        $access->revoke($manager, $case->id, $reader);
        $this->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $this->assertSame(1, SecurityAuditLog::where('event', 'case.membership.granted')->count());
        $this->assertSame(1, SecurityAuditLog::where('event', 'case.membership.revoked')->count());
        $json = SecurityAuditLog::where('event', 'like', 'case.membership.%')->get()->toJson();
        $this->assertStringNotContainsString($case->title, $json);
        $this->assertStringNotContainsString($reader->email, $json);
    }

    public static function invalidStates(): array
    {
        return array_map(fn ($state) => [$state], ['expired', 'revoked', 'account_inactive', 'employee_inactive', 'employee_deleted', 'identity_relinked']);
    }

    #[DataProvider('invalidStates')]
    public function test_fresh_lifecycle_and_membership_state_deny_stale_access(string $state): void
    {
        $reader = $this->reader();
        $case = $this->matter();
        $membership = $this->member($reader, $case);
        $this->assertTrue(app(CaseAccessService::class)->allows($reader, $case->id));
        $replacement = $state === 'identity_relinked' ? \App\Models\Employee::create([
            'employee_code' => 'B31-RELINKED', 'full_name' => 'Synthetic replacement identity',
            'office_id' => $reader->employee->office_id, 'hire_date' => '2026-01-01', 'status' => 'active',
        ]) : null;
        match ($state) {
            'expired' => $membership->forceFill(['expires_at' => now()->subSecond()])->save(),
            'revoked' => $membership->forceFill(['revoked_at' => now()])->save(),
            'account_inactive' => DB::table('users')->where('id', $reader->id)->update(['is_active' => false]),
            'employee_inactive' => DB::table('employees')->where('id', $reader->employee_id)->update(['status' => 'resigned']),
            'employee_deleted' => DB::table('employees')->where('id', $reader->employee_id)->update(['deleted_at' => now()]),
            'identity_relinked' => DB::table('users')->where('id', $reader->id)->update(['employee_id' => $replacement->id]),
        };
        $this->assertFalse(app(CaseAccessService::class)->allows($reader, $case->id));
        $response = $this->actingAs($reader, 'sanctum')->getJson('/api/case-files/'.$case->id);
        $this->assertContains($response->status(), [401, 404]);
    }

    public function test_nested_foreign_documents_tasks_and_history_cannot_bypass_parent(): void
    {
        $reader = $this->reader('nested', ['document.view', 'document.update', 'task.update']);
        $own = $this->matter();
        $foreign = $this->matter();
        $doc = $this->document($foreign);
        $task = $foreign->caseTasks()->create(['title' => 'Synthetic private task', 'status' => 'unaccepted',
            'assigned_employee_id' => $reader->employee_id, 'case_document_id' => $doc->id]);
        $this->member($reader, $own, ['read', 'write']);
        $this->actingAs($reader, 'sanctum');
        foreach (["/api/case-files/{$foreign->id}/workspace", "/api/case-files/{$foreign->id}/document-collection/{$doc->id}",
            "/api/case-files/{$own->id}/document-collection/{$doc->id}", "/api/case-files/{$own->id}/case-tasks/{$task->id}",
            "/api/case-files/{$foreign->id}/history?search=private", "/api/case-files/{$foreign->id}/documents"] as $url) {
            $this->getJson($url)->assertNotFound();
        }
        $this->patchJson("/api/case-files/{$own->id}/documents/{$doc->id}", ['title' => 'Not permitted'])->assertNotFound();
        $this->postJson("/api/case-files/{$foreign->id}/case-tasks/{$task->id}/accept")->assertNotFound();
        $this->assertSame('unaccepted', $task->fresh()->status);
        $this->assertFalse($task->isVisibleTo($reader));
    }

    public function test_search_counts_workspace_and_legacy_task_lists_do_not_disclose_other_cases(): void
    {
        $reader = $this->reader('lists', ['task.view_own', 'task.view_all', 'employee.view']);
        $own = $this->matter();
        $hidden = $this->matter();
        $this->member($reader, $own);
        $hiddenDoc = $this->document($hidden);
        EmployeeTask::create(['employee_id' => $reader->employee_id, 'assigned_by' => $reader->id,
            'case_document_id' => $hiddenDoc->id, 'title' => 'SYNTHETIC CONFIDENTIAL LEGACY TASK', 'status' => 'pending', 'duration_minutes' => 30]);
        $this->actingAs($reader, 'sanctum');
        $this->getJson('/api/case-files?search=SYNTHETIC')->assertOk()->assertJsonCount(1, 'case_files')->assertJsonPath('case_files.0.id', $own->id);
        $this->getJson('/api/my/tasks')->assertOk()->assertJsonCount(0, 'tasks');
        $this->getJson('/api/organization')->assertOk()->assertDontSee('SYNTHETIC CONFIDENTIAL LEGACY TASK');
        $this->getJson('/api/case-files/'.$own->id.'/history')->assertOk()->assertJsonPath('counts.all', 0);
    }

    public function test_approval_queue_and_existing_notifications_recheck_confidential_references(): void
    {
        $reader = $this->reader('queue', ['approval.view', 'approval.approve']);
        $own = $this->matter();
        $hidden = $this->matter();
        $this->member($reader, $own, ['read', 'write']);
        foreach ([$own, $hidden] as $case) {
            $approval = ApprovalRequest::create(['action_type' => 'synthetic', 'tool_name' => 'synthetic',
                'payload' => ['case_file_id' => $case->id, 'private_text' => 'SYNTHETIC CASE '.$case->id], 'requested_by' => $reader->id, 'status' => 'pending']);
            EmployeeNotification::create(['user_id' => $reader->id, 'kind' => 'info', 'title' => 'SYNTHETIC CASE '.$case->id,
                'message' => 'Synthetic confidential message', 'data' => ['approval_id' => $approval->id, 'target_path' => '/approvals']]);
        }
        $hiddenApproval = ApprovalRequest::latest('id')->first();
        $hiddenNotice = EmployeeNotification::latest('id')->first();
        $this->actingAs($reader, 'sanctum');
        $this->getJson('/api/approvals')->assertOk()->assertJsonCount(1, 'approvals');
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'notifications');
        $this->patchJson('/api/approvals/'.$hiddenApproval->id.'/approve')->assertForbidden();
        $this->patchJson('/api/notifications/'.$hiddenNotice->id.'/read')->assertNotFound();
        $this->assertSame('pending', $hiddenApproval->fresh()->status);
        $this->assertNull($hiddenNotice->fresh()->read_at);
    }

    public function test_read_only_membership_cannot_mutate_even_with_functional_permission(): void
    {
        $reader = $this->reader('read-only', ['case.update']);
        $case = $this->matter();
        $this->member($reader, $case);
        $this->actingAs($reader, 'sanctum')->patchJson('/api/case-files/'.$case->id.'/incident', ['incident_summary' => 'SYNTHETIC'])->assertForbidden();
        $this->assertNull($case->fresh()->incident_summary);
    }

    public function test_manager_cannot_self_grant_or_delegate_management_or_legal_authority(): void
    {
        $case = $this->matter();
        $manager = $this->manager($case);
        $target = $this->reader();
        $access = app(CaseAccessService::class);
        foreach ([[$manager, ['read']], [$target, ['read', 'manage']], [$target, ['read', 'final_legal']]] as [$subject, $scopes]) {
            try {
                $access->grant($manager, $case->id, $subject, $scopes, now()->addMinutes(30));
                $this->fail('Self/protected scope grant must fail.');
            } catch (AuthorizationException) {
                $this->assertDatabaseCount('case_memberships', 0);
            }
        }
    }

    public function test_audit_failure_rolls_back_grant_and_revoke(): void
    {
        $case = $this->matter();
        $manager = $this->manager($case);
        $reader = $this->reader();
        $access = app(CaseAccessService::class);
        $logger = \Mockery::mock(\App\Services\SecurityAuditLogger::class)->makePartial();
        $this->app->instance(\App\Services\SecurityAuditLogger::class, $logger);
        $logger->shouldReceive('recordCaseAccess')->once()->andThrow(new \RuntimeException('Synthetic audit failure'));
        try {
            $access->grant($manager, $case->id, $reader, ['read'], now()->addMinutes(30));
            $this->fail('Unaudited grant must not commit.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Synthetic audit failure', $error->getMessage());
        }
        $this->assertDatabaseCount('case_memberships', 0);
        $member = $this->member($reader, $case);
        $logger->shouldReceive('recordCaseAccess')->once()->andThrow(new \RuntimeException('Synthetic revoke audit failure'));
        try {
            $access->revoke($manager, $case->id, $reader);
            $this->fail('Unaudited revoke must roll back.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Synthetic revoke audit failure', $error->getMessage());
        }
        $this->assertNull($member->fresh()->revoked_at);
        $this->assertTrue($access->allows($reader, $case->id));
    }

    public function test_valid_membership_preserves_manual_file_upload_review_download_and_history(): void
    {
        $reader = $this->reader('file-worker', ['case.update', 'task.manage', 'task.update', 'task.review']);
        $case = $this->matter();
        $document = $this->document($case);
        $this->member($reader, $case, ['read', 'write']);
        $this->actingAs($reader, 'sanctum');
        $url = '/api/case-files/'.$case->id.'/document-collection/'.$document->id;
        $this->post($url.'/received-documents', ['storage_type' => 'upload', 'title' => 'synthetic.pdf',
            'file' => UploadedFile::fake()->create('synthetic.pdf', 8, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        $file = \App\Models\ReceivedDocument::sole();
        $this->postJson($url.'/file-review', ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertOk();
        $this->get($url.'/received-documents/'.$file->id.'/download')->assertOk();
        $this->getJson('/api/case-files/'.$case->id.'/history')->assertOk();
        $this->assertSame('approved', $file->fresh()->review_status);
        $this->assertFalse($reader->hasPermission('document.approve_legal'));
    }

    public static function auditOperations(): array
    {
        return [['granted'], ['revoked']];
    }

    #[DataProvider('auditOperations')]
    public function test_actual_audit_database_failure_rolls_back_membership_mutation(string $operation): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $case = $this->matter();
        $manager = $this->manager($case);
        $reader = $this->reader();
        $member = $operation === 'revoked' ? $this->member($reader, $case) : null;
        // A real SQLite write fault, not a production database operation or swallowed logger mock.
        DB::unprepared("CREATE TRIGGER synthetic_b31_audit_fault BEFORE INSERT ON security_audit_logs
            WHEN NEW.event = 'case.membership.{$operation}' BEGIN SELECT RAISE(ABORT, 'synthetic audit write fault'); END");
        try {
            $access = app(CaseAccessService::class);
            $operation === 'granted'
                ? $access->grant($manager, $case->id, $reader, ['read'], now()->addMinutes(30))
                : $access->revoke($manager, $case->id, $reader);
            $this->fail('Audit persistence failure must fail the whole mutation.');
        } catch (\Illuminate\Database\QueryException $error) {
            $this->assertStringContainsString('synthetic audit write fault', $error->getMessage());
        }
        if ($member) {
            $this->assertNull($member->fresh()->revoked_at);
            $this->assertSame(1, $member->fresh()->revision);
        } else {
            $this->assertDatabaseCount('case_memberships', 0);
        }
    }
}
