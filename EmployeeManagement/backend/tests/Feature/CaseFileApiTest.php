<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\OfficeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CaseFileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_create_and_view_a_case_file_with_records(): void
    {
        $user = User::factory()->create();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(CaseTypeSeeder::class);
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);
        $case = $this->actingAs($user, 'sanctum')->postJson('/api/case-files', [
            'title' => 'DEMO API Case',
            'case_type_id' => 1,
            'client' => [
                'name' => 'DEMO API Client',
                'name_kana' => 'デモ・クライアント',
                'client_type' => 'individual',
            ],
            'status' => 'active',
        ])->assertCreated()->json('case_file');
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/documents", ['category' => '証拠', 'title' => 'DEMO Evidence'])->assertCreated();
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/meeting-logs", [
            'meeting_date' => '2026-08-21',
            'interaction_type' => 'phone',
            'content' => 'Called the client.',
            'next_action' => 'Prepare documents.',
            'next_action_due_at' => '2026-08-22 10:00:00',
        ])->assertCreated()->assertJsonPath('meeting_log.interaction_type', 'phone');
        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case['id']}")->assertOk()->assertJsonPath('case_file.client.name', 'DEMO API Client')->assertJsonCount(1, 'case_file.documents')->assertJsonCount(1, 'case_file.meeting_logs');
    }

    public function test_authenticated_user_can_view_the_active_case_type_catalog(): void
    {
        $user = User::factory()->create();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(CaseTypeSeeder::class);
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/case-types')
            ->assertOk()
            ->assertJsonPath('case_types.0.name', '在留期間更新');
    }

    public function test_other_case_type_requires_and_saves_its_detail(): void
    {
        $user = User::factory()->create();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(CaseTypeSeeder::class);
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);

        $payload = [
            'title' => 'Other case type',
            'case_type_id' => 10,
            'client' => [
                'name' => 'Demo Client',
                'client_type' => 'individual',
            ],
        ];

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/case-files', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('case_type_other');

        $payload['case_type_other'] = 'その他の在留手続き';

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/case-files', $payload)
            ->assertCreated()
            ->assertJsonPath('case_file.case_type', 'その他')
            ->assertJsonPath('case_file.case_type_other', 'その他の在留手続き');
    }

    public function test_deleting_a_client_requires_explicit_confirmation_when_cases_exist(): void
    {
        $user = User::factory()->create();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(CaseTypeSeeder::class);
        $user->roles()->sync([Role::query()->where('name', 'level_5')->value('id')]);
        $case = $this->actingAs($user, 'sanctum')->postJson('/api/case-files', [
            'title' => 'Delete client case',
            'case_type_id' => 1,
            'client' => ['name' => 'Delete Client', 'client_type' => 'individual'],
        ])->assertCreated()->json('case_file');

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/clients/{$case['client']['id']}")
            ->assertConflict();

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/clients/{$case['client']['id']}?delete_case_files=1")
            ->assertOk();

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/case-files/{$case['id']}")
            ->assertNotFound();
    }

    public function test_only_level_four_or_higher_can_assign_a_case_to_an_employee(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $this->seed(CaseTypeSeeder::class);
        $this->seed(OfficeSeeder::class);

        $levelFourUser = User::factory()->create();
        $levelThreeUser = User::factory()->create();
        $levelFourUser->roles()->sync([Role::query()->where('name', 'level_4')->value('id')]);
        $levelThreeUser->roles()->sync([Role::query()->where('name', 'level_3')->value('id')]);

        $assignee = Employee::query()->create([
            'employee_code' => 'TEST-ASSIGNEE',
            'full_name' => 'Assignment Test Employee',
            'hire_date' => '2026-08-24',
            'office_id' => Office::query()->where('office_code', 'THEMIS')->value('id'),
            'status' => 'active',
        ]);

        $case = $this->actingAs($levelFourUser, 'sanctum')->postJson('/api/case-files', [
            'title' => 'Assignment protected case',
            'case_type_id' => 1,
            'client' => ['name' => 'Assignment Client', 'client_type' => 'individual'],
        ])->assertCreated()->json('case_file');

        $this->actingAs($levelThreeUser, 'sanctum')
            ->patchJson("/api/case-files/{$case['id']}", ['assigned_employee_id' => $assignee->id])
            ->assertForbidden();

        $this->actingAs($levelFourUser, 'sanctum')
            ->patchJson("/api/case-files/{$case['id']}/assignee", ['assigned_employee_id' => $assignee->id])
            ->assertOk()
            ->assertJsonPath('case_file.assigned_employee.id', $assignee->id);

        $this->assertDatabaseHas('case_files', [
            'id' => $case['id'],
            'assigned_employee_id' => $assignee->id,
        ]);
    }
}
