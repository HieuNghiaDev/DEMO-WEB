<?php

namespace Tests\Feature\B26;

use App\Models\CaseActivity;
use App\Services\CaseWorkspaceAuditService;
use Tests\Support\B21\B21TestCase;

/** Independent evidence for the existing history contract; original five count gates are retained. */
class HistoryContractInvestigationTest extends B21TestCase
{
    public function test_case_created_is_a_server_owned_audit_not_automatic_document_initialization(): void
    {
        $editor = $this->fixtureUser('history-investigation', ['case.view', 'case.create']);
        $type = \App\Models\CaseType::create(['name' => 'Synthetic case type', 'is_active' => true]);
        $response = $this->actingAs($editor, 'sanctum')->postJson('/api/case-files', [
            'classification' => 'normal',
            'case_type_id' => $type->id, 'title' => 'Synthetic history investigation', 'client' => ['name' => 'Synthetic client'],
        ])->assertCreated()->assertJsonPath('case_file.documents_count', 0);
        $activity = CaseActivity::sole();
        $this->assertSame('case.created', $activity->metadata['event']);
        $this->assertSame($editor->employee_id, $activity->created_by_employee_id);
        $this->assertSame($response->json('case_file.id'), $activity->case_file_id);
        $this->assertDatabaseCount('case_documents', 0);
        $this->getJson('/api/case-files/'.$activity->case_file_id.'/history?kind=system')
            ->assertOk()->assertJsonCount(1, 'entries')->assertJsonPath('entries.0.permissions.can_edit', false);
    }

    public function test_failed_case_created_audit_rolls_back_creation_instead_of_suppressing_audit(): void
    {
        $editor = $this->fixtureUser('history-audit-rollback', ['case.view', 'case.create']);
        $type = \App\Models\CaseType::create(['name' => 'Synthetic case type', 'is_active' => true]);
        $this->mock(CaseWorkspaceAuditService::class)->shouldReceive('record')->once()
            ->andThrow(new \RuntimeException('Synthetic audit unavailable'));
        $this->actingAs($editor, 'sanctum')->postJson('/api/case-files', [
            'classification' => 'normal',
            'case_type_id' => $type->id, 'title' => 'Synthetic rollback', 'client' => ['name' => 'Synthetic rollback client'],
        ])->assertStatus(500);
        $this->assertDatabaseCount('case_files', 0);
        $this->assertDatabaseCount('clients', 0);
        $this->assertDatabaseCount('case_activities', 0);
    }
}
