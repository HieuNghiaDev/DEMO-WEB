<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\Client;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CaseDocumentTest extends TestCase
{
    use RefreshDatabase;

    public function test_document_can_be_updated_and_deleted_from_its_case(): void
    {
        Sanctum::actingAs($this->userWithCasePermissions());
        $client = Client::create(['name' => 'Test Client']);
        $caseFile = CaseFile::create([
            'client_id' => $client->id,
            'title' => 'Test Case',
            'status' => 'active',
        ]);
        $document = $caseFile->documents()->create([
            'category' => 'contract',
            'title' => 'Old title',
            'version' => '1',
            'status' => 'draft',
        ]);

        $this->patchJson("/api/case-files/{$caseFile->id}/documents/{$document->id}", [
            'title' => 'Updated title',
        ])
            ->assertOk()
            ->assertJsonPath('document.title', 'Updated title')
            ->assertJsonPath('document.version', '2');

        $this->postJson("/api/case-files/{$caseFile->id}/documents", [
            'category' => '申請書',
            'title' => 'New document',
            'version' => '99',
        ])->assertCreated()->assertJsonPath('document.version', '1');

        $this->deleteJson("/api/case-files/{$caseFile->id}/documents/{$document->id}")
            ->assertOk();

        $this->assertSoftDeleted('case_documents', ['id' => $document->id]);
    }

    public function test_document_from_another_case_cannot_be_changed_or_deleted(): void
    {
        Sanctum::actingAs($this->userWithCasePermissions());
        $client = Client::create(['name' => 'Test Client']);
        $firstCase = CaseFile::create([
            'client_id' => $client->id,
            'title' => 'First Case',
            'status' => 'active',
        ]);
        $secondCase = CaseFile::create([
            'client_id' => $client->id,
            'title' => 'Second Case',
            'status' => 'active',
        ]);
        $document = CaseDocument::create([
            'case_file_id' => $firstCase->id,
            'category' => 'contract',
            'title' => 'Protected document',
            'status' => 'draft',
        ]);

        $this->patchJson("/api/case-files/{$secondCase->id}/documents/{$document->id}", [
            'title' => 'Wrong case',
        ])->assertNotFound();

        $this->deleteJson("/api/case-files/{$secondCase->id}/documents/{$document->id}")
            ->assertNotFound();
        $this->assertDatabaseHas('case_documents', ['id' => $document->id]);
    }

    private function userWithCasePermissions(): User
    {
        $this->seed(RolePermissionSeeder::class);
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);

        return $user;
    }
}
