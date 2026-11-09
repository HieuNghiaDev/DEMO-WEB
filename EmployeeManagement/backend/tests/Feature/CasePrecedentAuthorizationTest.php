<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\SecurityRemediationTestCase;

class CasePrecedentAuthorizationTest extends SecurityRemediationTestCase
{
    public static function methods(): array
    {
        return [['GET'], ['POST']];
    }

    #[DataProvider('methods')]
    public function test_guest_cannot_access_precedents(string $method): void
    {
        $case = $this->matter();
        $this->json($method, "/api/case-files/{$case->id}/precedents", ['title' => 'Synthetic'])
            ->assertUnauthorized();
        $this->assertDatabaseCount('case_precedents', 0);
    }

    #[DataProvider('methods')]
    public function test_employee_without_case_permissions_is_denied(string $method): void
    {
        Sanctum::actingAs($this->actor('no-role', null));
        $case = $this->matter();
        $this->json($method, "/api/case-files/{$case->id}/precedents", ['title' => 'Synthetic'])
            ->assertForbidden();
        $this->assertDatabaseCount('case_precedents', 0);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_reader_can_read_only_the_requested_case_and_cannot_create(): void
    {
        Sanctum::actingAs($this->actor('reader', 'level_1'));
        $case = $this->matter();
        $other = $this->matter();
        $precedent = $case->precedents()->create(['title' => 'Visible synthetic precedent']);
        $other->precedents()->create(['title' => 'Other case precedent']);

        $this->getJson("/api/case-files/{$case->id}/precedents")
            ->assertOk()->assertJsonCount(1, 'precedents')
            ->assertJsonPath('precedents.0.id', $precedent->id);
        $this->postJson("/api/case-files/{$case->id}/precedents", ['title' => 'Forbidden'])
            ->assertForbidden();
        $this->assertDatabaseCount('case_precedents', 2);
    }

    #[DataProvider('methods')]
    public function test_update_permission_alone_does_not_bypass_case_view(string $method): void
    {
        $actor = $this->actor('write-only', null);
        $role = Role::create(['name' => 'synthetic_write_only', 'display_name' => 'Synthetic']);
        $role->permissions()->sync([Permission::where('name', 'case.update')->value('id')]);
        $actor->roles()->sync([$role->id]);
        Sanctum::actingAs($actor);
        $case = $this->matter();

        $this->json($method, "/api/case-files/{$case->id}/precedents", ['title' => 'Forbidden'])
            ->assertForbidden();
        $this->assertDatabaseCount('case_precedents', 0);
    }

    public function test_editor_cannot_spoof_creator_ai_or_parent_case(): void
    {
        $actor = $this->actor('editor', 'level_3');
        $other = $this->actor('other', 'level_1');
        $case = $this->matter();
        $otherCase = $this->matter();
        Sanctum::actingAs($actor);

        $response = $this->postJson("/api/case-files/{$case->id}/precedents", [
            'title' => 'Synthetic valid precedent', 'citation' => 'Synthetic citation',
            'summary' => 'Synthetic summary', 'relevance' => 'Synthetic relevance',
            'source_url' => 'https://example.test/precedent',
            'created_by_employee_id' => $other->employee_id,
            'created_by_ai_name' => 'Spoofed AI', 'case_file_id' => $otherCase->id,
        ])->assertCreated()->assertJsonPath('precedent.case_file_id', $case->id)
            ->assertJsonPath('precedent.created_by_employee_id', $actor->employee_id);

        $precedent = $case->precedents()->findOrFail($response->json('precedent.id'));
        $this->assertNull($precedent->created_by_ai_name);
        $this->assertSame('Synthetic summary', $precedent->summary);
        $this->assertSame(0, $otherCase->precedents()->count());
        $this->assertDatabaseHas('case_activities', [
            'case_file_id' => $case->id, 'created_by_employee_id' => $actor->employee_id,
        ]);
    }

    public function test_editor_without_client_creator_is_attributed_to_authenticated_employee(): void
    {
        $actor = $this->actor('editor-default', 'level_3');
        Sanctum::actingAs($actor);
        $case = $this->matter();
        $this->postJson("/api/case-files/{$case->id}/precedents", ['title' => 'Synthetic'])
            ->assertCreated()->assertJsonPath('precedent.created_by_employee_id', $actor->employee_id);
    }

    public function test_lawful_account_without_employee_keeps_access_and_real_audit_actor(): void
    {
        $actor = User::factory()->create(['must_change_password' => false, 'role' => 'employee']);
        $actor->roles()->sync([Role::where('name', 'level_3')->value('id')]);
        Sanctum::actingAs($actor);
        $case = $this->matter();
        $this->postJson("/api/case-files/{$case->id}/precedents", ['title' => 'Synthetic'])
            ->assertCreated()->assertJsonPath('precedent.created_by_employee_id', null);
        $this->assertSame(1, $case->activities()->count());
        $this->assertSame($actor->id, $case->activities()->firstOrFail()->metadata['actor_user_id']);
    }

    #[DataProvider('methods')]
    public function test_deleted_case_is_not_accessible(string $method): void
    {
        Sanctum::actingAs($this->actor('editor-deleted', 'level_3'));
        $case = $this->matter();
        $case->delete();
        $this->json($method, "/api/case-files/{$case->id}/precedents", ['title' => 'Synthetic'])
            ->assertNotFound();
        $this->assertDatabaseCount('case_precedents', 0);
    }
}
