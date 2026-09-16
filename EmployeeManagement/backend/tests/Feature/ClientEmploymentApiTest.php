<?php

namespace Tests\Feature;

use App\Models\CaseType;
use App\Models\Client;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClientEmploymentApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(CaseTypeSeeder::class);
        $this->user = User::factory()->create();
        $this->user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);
    }

    public function test_quick_intake_does_not_require_employment_for_supported_case_types(): void
    {
        foreach (['労災', '交通事故'] as $typeName) {
            $this->actingAs($this->user, 'sanctum')->postJson('/api/case-files', [
                'title' => "Quick {$typeName}",
                'case_type_id' => CaseType::query()->where('name', $typeName)->sole()->id,
                'client' => ['name' => "{$typeName} Client", 'client_type' => 'individual'],
            ])->assertCreated()->assertJsonCount(0, 'case_file.client.employments');
        }

        $this->assertDatabaseCount('client_employments', 0);
    }

    public function test_case_creation_persists_current_and_past_employments_with_the_client(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/case-files', [
            'title' => 'Employment history case',
            'case_type_id' => CaseType::query()->where('name', '労災')->sole()->id,
            'client' => ['name' => 'Employment Client', 'client_type' => 'individual'],
            'employments' => [
                [
                    'company_name' => 'Current Company', 'company_address' => '大阪府大阪市1-1',
                    'company_phone' => '06-1111-2222', 'employment_status' => 'employed',
                    'start_date' => '2025-01-01', 'end_date' => '2026-01-01', 'is_current' => true,
                ],
                [
                    'company_name' => 'Former Company', 'company_address' => '兵庫県神戸市2-2',
                    'employment_status' => 'former', 'start_date' => '2020-04-01',
                    'end_date' => '2024-12-31', 'is_current' => false,
                ],
            ],
        ])->assertCreated()->assertJsonCount(2, 'case_file.client.employments');

        $clientId = $response->json('case_file.client.id');
        $this->assertDatabaseHas('client_employments', [
            'client_id' => $clientId, 'company_name' => 'Current Company', 'is_current' => true, 'end_date' => null,
        ]);
        $this->assertDatabaseHas('client_employments', [
            'client_id' => $clientId, 'company_name' => 'Former Company', 'is_current' => false,
        ]);
    }

    public function test_invalid_employment_prevents_the_entire_intake_from_being_created(): void
    {
        $this->actingAs($this->user, 'sanctum')->postJson('/api/case-files', [
            'title' => 'Invalid employment case',
            'case_type_id' => CaseType::query()->where('name', '労災')->sole()->id,
            'client' => ['name' => 'Should Not Persist'],
            'employments' => [[
                'company_name' => '', 'company_address' => '', 'employment_status' => 'employed', 'is_current' => true,
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors([
            'employments.0.company_name', 'employments.0.company_address',
        ]);

        $this->assertDatabaseMissing('clients', ['name' => 'Should Not Persist']);
        $this->assertDatabaseMissing('case_files', ['title' => 'Invalid employment case']);
    }

    public function test_authorized_user_can_add_edit_list_and_delete_employment_after_intake(): void
    {
        $client = Client::query()->create(['name' => 'Existing Client']);

        $employment = $this->actingAs($this->user, 'sanctum')->postJson("/api/clients/{$client->id}/employments", [
            'company_name' => 'First Company', 'company_address' => '大阪市北区',
            'employment_status' => 'employed', 'is_current' => true,
        ])->assertCreated()->assertJsonPath('employment.company_name', 'First Company')->json('employment');

        $this->actingAs($this->user, 'sanctum')->patchJson("/api/clients/{$client->id}/employments/{$employment['id']}", [
            'company_name' => 'Updated Company', 'company_address' => '大阪市中央区',
            'employment_status' => 'former', 'start_date' => '2024-01-01',
            'end_date' => '2025-12-31', 'is_current' => false, 'notes' => '退職済み',
        ])->assertOk()->assertJsonPath('employment.company_name', 'Updated Company');

        $this->actingAs($this->user, 'sanctum')->getJson("/api/clients/{$client->id}/employments")
            ->assertOk()->assertJsonCount(1, 'employments');

        $this->actingAs($this->user, 'sanctum')->deleteJson("/api/clients/{$client->id}/employments/{$employment['id']}")
            ->assertOk();
        $this->assertDatabaseMissing('client_employments', ['id' => $employment['id']]);
    }

    public function test_nested_routes_do_not_allow_cross_client_employment_access(): void
    {
        $owner = Client::query()->create(['name' => 'Owner']);
        $other = Client::query()->create(['name' => 'Other']);
        $employment = $owner->employments()->create([
            'company_name' => 'Owner Company', 'company_address' => '大阪市',
            'employment_status' => 'employed', 'is_current' => true,
        ]);

        $this->actingAs($this->user, 'sanctum')->deleteJson("/api/clients/{$other->id}/employments/{$employment->id}")
            ->assertNotFound();
        $this->assertDatabaseHas('client_employments', ['id' => $employment->id]);
    }
}
