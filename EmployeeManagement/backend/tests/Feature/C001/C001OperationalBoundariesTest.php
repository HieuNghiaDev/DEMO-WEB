<?php

namespace Tests\Feature\C001;

use App\Models\CaseTask;
use App\Services\LegalFinalizationGate;
use Illuminate\Support\Facades\Schema;
use Tests\Support\B21\B21TestCase;

/** Explicit operational grants, without lawyer status or MFA; no real role provisioning. */
class C001OperationalBoundariesTest extends B21TestCase
{
    public function test_explicit_manager_can_manage_documents_and_assign_scoped_staff_without_legal_authority(): void
    {
        $manager = $this->fixtureUser('operational-manager', ['case.view', 'case.update', 'document.create', 'document.update', 'document.delete', 'task.manage']);
        $staff = $this->fixtureUser('assigned-staff', ['case.view', 'task.view_own', 'task.update']);
        $other = $this->fixtureUser('unassigned-staff', ['case.view', 'task.view_own', 'task.update']);
        $case = $this->matter();
        if (Schema::hasColumn('case_files', 'is_confidential')) $case->forceFill(['is_confidential' => false])->save();
        $base = '/api/case-files/'.$case->id;
        $this->actingAs($manager);
        $id = $this->postJson($base.'/documents', ['title' => 'Synthetic ordinary required document', 'category' => 'required', 'status' => 'not_requested'])
            ->assertCreated()->json('document.id');
        $this->patchJson($base.'/documents/'.$id, ['status' => 'requested'])->assertOk()->assertJsonPath('document.status', 'requested');
        $this->patchJson($base.'/document-collection/'.$id, ['necessity_status' => 'required'])->assertOk();
        $this->postJson($base.'/case-tasks', ['title' => 'Synthetic assigned operational task', 'assigned_employee_id' => $staff->employee_id])
            ->assertCreated();
        $task = CaseTask::where('case_file_id', $case->id)->where('assigned_employee_id', $staff->employee_id)->sole();
        $this->assertFalse($manager->fresh()->hasPermission('document.approve_legal'));
        $this->assertFalse($staff->fresh()->hasPermission('case.update'));
        $this->actingAs($staff)->getJson($base.'/case-tasks/'.$task->id)->assertOk();
        $this->patchJson($base.'/document-collection/'.$id, ['necessity_status' => 'not_required'])->assertForbidden();
        $this->postJson($base.'/case-tasks', ['title' => 'Forbidden reassignment'])->assertForbidden();
        $this->actingAs($other)->getJson($base.'/case-tasks')->assertOk()->assertJsonCount(0, 'tasks');
        $this->getJson($base.'/case-tasks/'.$task->id)->assertForbidden();
        $this->actingAs($manager)->deleteJson($base.'/documents/'.$id)->assertOk();
        $this->assertTrue(LegalFinalizationGate::policyPending());
        $this->assertDatabaseCount('account_mfa', 0);
    }
}
