<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseType;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\CaseWorkspaceTemplateSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CaseWorkspaceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_case_creation_applies_versioned_document_template_and_workspace_items_are_manageable(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class, CaseWorkspaceTemplateSeeder::class]);
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);
        $caseType = CaseType::query()->where('name', '在留期間更新')->firstOrFail();

        $case = $this->actingAs($user, 'sanctum')->postJson('/api/case-files', [
            'case_type_id' => $caseType->id,
            'client' => ['name' => 'Workspace Client', 'client_type' => 'individual'],
            'title' => 'Workspace Client - 在留期間更新',
            'status' => 'active',
            'priority' => 'high',
        ])->assertCreated()->json('case_file');

        $this->assertDatabaseHas('case_documents', [
            'case_file_id' => $case['id'],
            'title' => '申請書',
            'requirement_level' => 'required',
            'is_template_generated' => true,
        ]);

        $applicationDocumentId = CaseDocument::query()
            ->where('case_file_id', $case['id'])
            ->where('title', '申請書')
            ->value('id');
        $summaryBefore = $this->actingAs($user, 'sanctum')
            ->getJson("/api/case-files/{$case['id']}/workspace")
            ->json('summary');

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/case-files/{$case['id']}/documents/{$applicationDocumentId}", ['status' => 'not_required'])
            ->assertOk()
            ->assertJsonPath('document.status', 'not_required');
        $this->actingAs($user, 'sanctum')
            ->getJson("/api/case-files/{$case['id']}/workspace")
            ->assertJsonPath('summary.missing_documents', $summaryBefore['missing_documents'] - 1)
            ->assertJsonPath('summary.documents_total', $summaryBefore['documents_total'] - 1);
        $this->actingAs($user, 'sanctum')->getJson('/api/case-files')
            ->assertJsonPath('case_files.0.documents_count', $summaryBefore['documents_total'] - 1);

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/case-files/{$case['id']}/documents/{$applicationDocumentId}", [
                'status' => 'not_requested',
                'file_url' => 'https://drive.google.com/file/d/demo-document',
            ])
            ->assertOk()
            ->assertJsonPath('document.status', 'not_requested')
            ->assertJsonPath('document.file_url', 'https://drive.google.com/file/d/demo-document');

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/documents", [
            'category' => '案件追加資料',
            'title' => '追加説明書',
            'requirement_level' => 'optional',
            'status' => 'requested',
        ])->assertCreated()->assertJsonPath('document.version', '1');

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/deadlines", [
            'deadline_type' => 'submission',
            'title' => '申請提出期限',
            'due_at' => '2026-09-10 17:00:00',
            'priority' => 'critical',
        ])->assertCreated();

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/case-tasks", [
            'title' => '必要書類を確認',
            'due_at' => '2026-09-05 17:00:00',
        ])->assertCreated();

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'employer',
            'name' => 'Example Company',
        ])->assertCreated();

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/activities", [
            'activity_type' => 'communication',
            'channel' => 'phone',
            'title' => '顧客へ書類を依頼',
            'occurred_at' => '2026-08-28 10:00:00',
        ])->assertCreated();

        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case['id']}/workspace")
            ->assertOk()
            ->assertJsonPath('case_file.priority', 'high')
            ->assertJsonCount(1, 'case_file.deadlines')
            ->assertJsonCount(1, 'case_file.case_tasks')
            ->assertJsonCount(1, 'case_file.parties')
            ->assertJsonCount(7, 'case_file.activities')
            ->assertJsonPath('summary.open_tasks', 1);

        $this->actingAs($user, 'sanctum')->deleteJson("/api/case-files/{$case['id']}")
            ->assertOk();
        $this->assertSoftDeleted('case_files', ['id' => $case['id']]);
    }

    public function test_reapplying_a_template_is_idempotent(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class, CaseWorkspaceTemplateSeeder::class]);
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);
        $caseType = CaseType::query()->where('name', '在留期間更新')->firstOrFail();
        $case = $this->actingAs($user, 'sanctum')->postJson('/api/case-files', [
            'case_type_id' => $caseType->id,
            'client' => ['name' => 'Template Client'],
            'title' => 'Template Client - 在留期間更新',
        ])->assertCreated()->json('case_file');
        $before = $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case['id']}/workspace")->json('summary.documents_total');

        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/apply-document-template")
            ->assertOk()
            ->assertJsonPath('created_count', 0);

        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case['id']}/workspace")
            ->assertJsonPath('summary.documents_total', $before);
    }
}
