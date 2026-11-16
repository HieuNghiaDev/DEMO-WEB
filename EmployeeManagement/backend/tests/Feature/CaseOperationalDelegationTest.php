<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseTaskSubmission;
use App\Models\CaseType;
use App\Models\Role;
use App\Models\User;
use App\Services\Administration\MainRoles;
use App\Services\GoogleDriveProvisioningService;
use App\Services\SecurityAuditLogger;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\Support\B21\B21TestCase;

class CaseOperationalDelegationTest extends B21TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        MainRoles::install();
    }

    private function account(string $name, string $role): User
    {
        $user = $this->fixtureUser($name, []);
        $user->getConnection()->table('user_roles')->insert([
            'user_id' => $user->id, 'role_id' => Role::where('name', $role)->sole()->id,
        ]);
        return $user->fresh();
    }

    private function normalCase(): CaseFile
    {
        $case = $this->matter();
        $case->forceFill(['is_confidential' => false])->save();
        return $case;
    }

    private function replaceGrants(User $actor, CaseFile $case, array $rows): void
    {
        $url = "/api/case-files/{$case->id}/task-delegations";
        $revision = $this->actingAs($actor, 'sanctum')->getJson($url)->assertOk()->json('revision');
        $this->putJson($url, ['revision' => $revision, 'task_delegations' => $rows])->assertOk();
    }

    private function grant(User $user, bool $create = false, bool $review = false, bool $edit = false): array
    {
        return ['user_id' => $user->id, 'create_tasks' => $create, 'review_tasks' => $review, 'edit_overview' => $edit];
    }

    public function test_lawyer_can_delegate_at_intake_without_granting_document_necessity_or_global_task_access(): void
    {
        $lawyer = $this->account('lawyer', 'lawyer');
        $operator = $this->account('operator', 'staff');
        $reviewer = $this->account('reviewer', 'staff');
        $type = CaseType::create(['name' => 'Synthetic case type', 'is_active' => true]);
        $this->mock(GoogleDriveProvisioningService::class)->shouldReceive('provisionCaseStructure')->once()
            ->andThrow(new \RuntimeException('External provisioning isolated'));

        $intake = ['classification' => 'normal', 'title' => 'Synthetic intake', 'case_type_id' => $type->id,
            'client' => ['name' => 'Synthetic client'], 'task_delegations' => [
                $this->grant($operator, create: true, edit: true), $this->grant($reviewer, review: true),
            ]];
        $this->actingAs($operator, 'sanctum')->postJson('/api/case-files', $intake)->assertForbidden();
        $caseId = $this->actingAs($lawyer, 'sanctum')->postJson('/api/case-files', $intake)->assertCreated()->json('case_file.id');
        $this->assertDatabaseCount('case_operational_grants', 2);
        $this->assertDatabaseHas('security_audit_logs', ['user_id' => $lawyer->id, 'event' => 'case.operations.delegation.updated']);
        $base = "/api/case-files/{$caseId}";
        $this->actingAs($operator, 'sanctum')->getJson($base.'/workspace')->assertOk()
            ->assertJsonPath('operations.create_tasks', true)->assertJsonPath('operations.manage_tasks', false)
            ->assertJsonPath('operations.review_tasks', false)->assertJsonPath('can_decide_document_necessity', false);
        $task = $this->postJson($base.'/case-tasks', ['title' => 'Scoped task', 'assigned_employee_id' => $reviewer->employee_id])
            ->assertCreated()->json('task.id');
        $this->getJson($base.'/case-tasks/options')->assertOk();
        $this->patchJson($base.'/case-tasks/'.$task, ['description' => 'Denied'])->assertForbidden();
        $this->patchJson($base.'/incident', ['incident_summary' => 'Scoped incident'])->assertOk();
        $this->patchJson($base.'/client-overview', ['name' => 'Scoped client'])->assertOk();
        $document = CaseFile::findOrFail($caseId)->documents()->create(['title' => 'Candidate', 'category' => 'Synthetic']);
        $this->patchJson($base.'/document-collection/'.$document->id, ['necessity_status' => 'required'])->assertForbidden();
        $this->getJson($base.'/task-delegations')->assertForbidden();
        $this->actingAs($lawyer, 'sanctum')->patchJson($base.'/document-collection/'.$document->id, ['necessity_status' => 'required'])->assertOk();
        $this->actingAs($operator, 'sanctum')->postJson($base.'/case-tasks/batch', ['tasks' => [[
            'case_document_id' => $document->id, 'assigned_employee_id' => $reviewer->employee_id, 'due_date' => '2026-11-25',
        ]]])->assertCreated();

        $other = $this->normalCase();
        $other->caseTasks()->create(['title' => 'Private task', 'status' => 'unaccepted', 'assigned_employee_id' => $reviewer->employee_id]);
        $this->getJson("/api/case-files/{$other->id}/case-tasks")->assertOk()->assertJsonCount(0, 'tasks');
        $this->postJson("/api/case-files/{$other->id}/case-tasks", ['title' => 'Denied'])->assertForbidden();
        $this->patchJson("/api/case-files/{$other->id}/client-overview", ['name' => 'Denied'])->assertForbidden();
        $this->patchJson("/api/clients/{$other->client_id}", ['name' => 'Denied'])->assertForbidden();

        $shared = $this->normalCase();
        $shared->update(['client_id' => CaseFile::findOrFail($caseId)->client_id]);
        $this->patchJson($base.'/client-overview', ['name' => 'Would edit two cases'])->assertForbidden();
    }

    public function test_legal_assistant_can_see_and_create_tasks_without_delegation_within_their_case_scope(): void
    {
        $assistant = $this->account('assistant', 'legal_assistant');
        $assignee = $this->account('assignee', 'staff');
        $case = $this->normalCase();
        $secret = $this->normalCase();
        $secret->forceFill(['is_confidential' => true])->save();
        $existing = $case->caseTasks()->create(['title' => 'Other employee task', 'status' => 'unaccepted', 'assigned_employee_id' => $assignee->employee_id]);
        $document = $case->documents()->create(['title' => 'Selected document', 'category' => 'Synthetic', 'necessity_status' => 'required']);
        $base = "/api/case-files/{$case->id}";
        $secretBase = "/api/case-files/{$secret->id}";

        $this->actingAs($assistant, 'sanctum')->getJson($base.'/workspace')->assertOk()
            ->assertJsonPath('case_file.case_tasks.0.id', $existing->id)
            ->assertJsonPath('operations.create_tasks', true)->assertJsonPath('operations.review_tasks', false)
            ->assertJsonPath('operations.manage_tasks', false)->assertJsonPath('operations.edit_overview', false)
            ->assertJsonPath('can_decide_document_necessity', false);
        $this->getJson($base."/case-tasks/{$existing->id}")->assertOk()->assertJsonPath('task.id', $existing->id);
        $this->postJson($base."/case-tasks/{$existing->id}/accept")->assertForbidden();
        $this->getJson($base.'/case-tasks/options')->assertOk();
        $this->postJson($base.'/case-tasks', ['title' => 'Legal assistant task', 'assigned_employee_id' => $assignee->employee_id])->assertCreated();
        $this->postJson($base.'/case-tasks/batch', ['tasks' => [[
            'case_document_id' => $document->id, 'assigned_employee_id' => $assignee->employee_id, 'due_date' => '2026-11-25',
        ]]])->assertCreated();
        $this->patchJson($base."/document-collection/{$document->id}", ['necessity_status' => 'not_required'])->assertForbidden();
        $this->patchJson($base.'/client-overview', ['name' => 'Denied'])->assertForbidden();
        $this->getJson($secretBase.'/case-tasks')->assertNotFound();
        $this->postJson($secretBase.'/case-tasks', ['title' => 'Denied'])->assertNotFound();
        $this->assertDatabaseCount('case_operational_grants', 0);

        $assistant->getConnection()->table('case_memberships')->insert([
            'case_file_id' => $secret->id, 'user_id' => $assistant->id, 'employee_id' => $assistant->employee_id,
            'can_read' => true, 'can_write' => false, 'can_read_confidential' => true, 'expires_at' => now()->addDay(),
        ]);
        $secretTask = $secret->caseTasks()->create(['title' => 'Task with read scope', 'status' => 'unaccepted', 'assigned_employee_id' => $assignee->employee_id]);
        $this->getJson($secretBase.'/case-tasks')->assertOk()->assertJsonPath('tasks.0.id', $secretTask->id);
        $this->postJson($secretBase.'/case-tasks', ['title' => 'Denied'])->assertForbidden();
    }

    #[TestWith(['lawyer'])]
    #[TestWith(['admin'])]
    public function test_reviewer_can_decide_only_ordinary_submissions_in_granted_case_and_revocation_is_immediate(string $role): void
    {
        $actor = $this->account($role, $role);
        $reviewer = $this->account('reviewer', 'staff');
        $assignee = $this->account('assignee', 'legal_assistant');
        $case = $this->normalCase();
        $base = "/api/case-files/{$case->id}";
        $document = $case->documents()->create(['title' => 'Necessary', 'category' => 'Synthetic', 'necessity_status' => 'required']);
        $task = $case->caseTasks()->create(['case_document_id' => $document->id, 'title' => 'Review',
            'status' => 'pending_review', 'assigned_employee_id' => $assignee->employee_id]);
        $submission = [
            'case_task_id' => $task->id, 'case_document_id' => $document->id, 'version' => 1,
            'source_type' => 'manual_upload', 'filename' => 'synthetic.pdf', 'submitted_by' => $assignee->id,
            'review_status' => 'pending_review', 'storage_provider' => 'local_file', 'external_file_id' => 'synthetic',
            'external_url' => '', 'mime_type' => 'application/pdf', 'submitted_at' => now(),
        ];
        $file = CaseTaskSubmission::create($submission);
        $path = $base."/case-tasks/{$task->id}/submissions/{$file->id}";
        $this->actingAs($reviewer, 'sanctum')->postJson($path.'/approve')->assertForbidden();
        $this->getJson($base."/case-tasks/{$task->id}")->assertForbidden();
        $this->replaceGrants($actor, $case, [$this->grant($reviewer, review: true)]);
        if ($role === 'admin') {
            $this->patchJson($base."/document-collection/{$document->id}", ['necessity_status' => 'not_required'])->assertForbidden();
        }
        $this->actingAs($reviewer, 'sanctum')->postJson($base.'/case-tasks', ['title' => 'Denied'])->assertForbidden();
        $this->getJson($base."/case-tasks/{$task->id}")->assertOk()->assertJsonPath('task.allowed_actions.can_approve', true);
        $this->postJson($path.'/reject', ['reason' => 'Synthetic revision'])->assertOk()->assertJsonPath('task.status', 'changes_requested');
        $file2 = CaseTaskSubmission::create([...$submission, 'version' => 2, 'external_file_id' => 'synthetic-2']);
        $task->refresh()->update(['status' => 'pending_review']);
        $this->postJson($base."/case-tasks/{$task->id}/submissions/{$file2->id}/approve")->assertOk()
            ->assertJsonPath('task.status', 'completed');
        $this->replaceGrants($actor, $case, []);
        $this->actingAs($reviewer, 'sanctum')->getJson($base.'/case-tasks')->assertOk()->assertJsonCount(0, 'tasks');
        $this->postJson($path.'/approve')->assertForbidden();
        $this->actingAs($assignee, 'sanctum')->getJson($base."/case-tasks/{$task->id}")->assertOk();
    }

    public function test_grants_require_case_scope_and_reject_self_and_stale_updates(): void
    {
        $lawyer = $this->account('lawyer', 'lawyer');
        $staff = $this->account('staff', 'staff');
        $case = $this->normalCase();
        $secret = $this->normalCase();
        $secret->forceFill(['is_confidential' => true])->save();
        $this->actingAs($lawyer, 'sanctum')->getJson("/api/case-files/{$secret->id}/task-delegations")->assertNotFound();
        $url = "/api/case-files/{$case->id}/task-delegations";
        $revision = $this->getJson($url)->assertOk()->json('revision');
        $this->putJson($url, ['revision' => $revision, 'task_delegations' => [$this->grant($lawyer, edit: true)]])->assertUnprocessable();
        $this->assertDatabaseCount('case_operational_grants', 0);
        $this->putJson($url, ['revision' => $revision, 'task_delegations' => [$this->grant($staff, create: true)]])->assertOk();
        $this->putJson($url, ['revision' => $revision, 'task_delegations' => []])->assertConflict();
        $this->assertDatabaseCount('case_operational_grants', 1);
        $staff->employee()->update(['status' => 'inactive']);
        $this->actingAs($staff->fresh(), 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks", ['title' => 'Denied'])
            ->assertStatus(401);
    }

    public function test_audit_failure_rolls_back_delegation_replacement(): void
    {
        $lawyer = $this->account('lawyer', 'lawyer');
        $staff = $this->account('staff', 'staff');
        $case = $this->normalCase();
        $this->replaceGrants($lawyer, $case, [$this->grant($staff, create: true)]);
        $url = "/api/case-files/{$case->id}/task-delegations";
        $revision = $this->getJson($url)->assertOk()->json('revision');
        $this->mock(SecurityAuditLogger::class)->shouldReceive('recordCaseOperationalGrants')->once()
            ->andThrow(new \RuntimeException('Synthetic audit failure'));
        $this->putJson($url, ['revision' => $revision, 'task_delegations' => []])->assertServerError();
        $this->assertDatabaseHas('case_operational_grants', ['case_file_id' => $case->id, 'user_id' => $staff->id, 'create_tasks' => true]);
    }
}
