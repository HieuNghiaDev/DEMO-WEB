<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use RuntimeException;
use Tests\TestCase;

class CaseIntakeWorkspacePersistenceTest extends TestCase
{
    use RefreshDatabase;

    private function userWithRole(string $role): User
    {
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', $role)->value('id')]);

        return $user;
    }

    private function createCase(User $user, string $name = 'Client', string $caseType = '労災'): array
    {
        return $this->actingAs($user, 'sanctum')->postJson('/api/case-files', [
            'title' => "$name / $caseType",
            'case_type_id' => CaseType::query()->where('name', $caseType)->sole()->id,
            'client' => ['name' => $name, 'client_type' => 'individual'],
        ])->assertCreated()->json('case_file');
    }

    public function test_incident_fields_persist_and_appear_in_workspace_with_audit(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $user = $this->userWithRole('level_5');
        $case = $this->createCase($user);

        $response = $this->patchJson("/api/case-files/{$case['id']}/incident", [
            'incident_summary' => '作業中の事故',
            'occurred_at' => '2026-09-15T14:20:00+09:00',
            'injury_details' => '右手の骨折',
            'incident_location' => '大阪市',
            'current_status_memo' => '通院中',
        ])->assertOk()->assertJsonPath('case_file.incident_summary', '作業中の事故');

        $this->assertSame(
            '2026-09-15T05:20:00+00:00',
            Carbon::parse($response->json('case_file.occurred_at'))->utc()->toIso8601String(),
        );
        $this->assertDatabaseHas('case_files', ['id' => $case['id'], 'occurred_at' => '2026-09-15 14:20:00']);

        $this->getJson("/api/case-files/{$case['id']}/workspace")
            ->assertOk()->assertJsonPath('case_file.injury_details', '右手の骨折');
        $this->assertDatabaseHas('case_activities', ['case_file_id' => $case['id'], 'title' => '事故・事件概要を更新']);
    }

    public function test_incident_validation_rejects_invalid_values(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $case = $this->createCase($this->userWithRole('level_5'));

        $this->patchJson("/api/case-files/{$case['id']}/incident", [
            'occurred_at' => 'not-a-date', 'injury_details' => str_repeat('x', 2001),
        ])->assertUnprocessable()->assertJsonValidationErrors(['occurred_at', 'injury_details']);
    }

    public function test_related_entity_create_update_and_workspace_read(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $case = $this->createCase($this->userWithRole('level_5'));
        $party = $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'employer', 'entity_type' => 'company',
            'relation_type' => 'dispatch_company', 'relation_status' => 'current',
            'name' => '大阪テクノ', 'is_current' => true,
            'start_date' => '2026-01-15', 'metadata' => ['industry' => '製造業'],
        ])->assertCreated()->assertJsonPath('party.relation_type', 'dispatch_company')->json('party');

        $this->patchJson("/api/case-files/{$case['id']}/parties/{$party['id']}", [
            'name' => '大阪テクノ株式会社', 'relation_status' => 'past', 'is_current' => false,
            'end_date' => '2026-09-15',
        ])->assertOk()->assertJsonPath('party.name', '大阪テクノ株式会社');

        $this->getJson("/api/case-files/{$case['id']}/workspace")
            ->assertOk()->assertJsonPath('case_file.parties.0.relation_status', 'past');
    }

    public function test_related_entity_types_persist_only_their_relevant_fields(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $case = $this->createCase($this->userWithRole('level_5'), 'Dynamic relations', '交通事故');

        $currentEmployer = $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'employer', 'entity_type' => 'company',
            'relation_type' => 'current_employer', 'relation_status' => 'current',
            'name' => '株式会社東大阪テクノ', 'is_current' => true,
            'start_date' => '2025-04-01', 'end_date' => '2026-01-01',
        ])->assertCreated()->json('party');
        $this->assertTrue($currentEmployer['is_current']);
        $this->assertNull($currentEmployer['end_date']);

        $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'employer', 'entity_type' => 'company',
            'relation_type' => 'former_employer', 'relation_status' => 'past',
            'name' => '株式会社ABC製作所', 'is_current' => false,
            'start_date' => '2020-04-01', 'end_date' => '2024-03-31',
        ])->assertCreated();

        foreach ([
            ['dispatch_company', '派遣元会社', '株式会社関西ワークサポート'],
            ['dispatch_destination', '派遣先会社', '株式会社大阪工業'],
        ] as [$relationType, $relationship, $name]) {
            $this->postJson("/api/case-files/{$case['id']}/parties", [
                'party_type' => 'employer', 'entity_type' => 'company',
                'relation_type' => $relationType, 'relation_status' => 'current',
                'relationship' => $relationship, 'name' => $name, 'is_current' => true,
                'start_date' => '2026-01-01',
            ])->assertCreated();
        }

        $insurance = $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'insurer', 'entity_type' => 'insurer',
            'relation_type' => 'own_insurer', 'relationship' => '保険会社',
            'name' => '東京海上テスト', 'contact_person' => '保険担当者',
            'reference_number' => 'CLAIM-001',
            'relation_status' => 'current', 'is_current' => true,
            'start_date' => '2026-01-01', 'end_date' => '2026-02-01',
            'metadata' => [
                'insurance_side' => 'own',
                'policy_number' => 'POLICY-001',
                'claim_number' => 'CLAIM-001',
                'department' => 'must be removed',
            ],
        ])->assertCreated()->json('party');
        $this->assertNull($insurance['relation_status']);
        $this->assertNull($insurance['is_current']);
        $this->assertNull($insurance['start_date']);
        $this->assertNull($insurance['end_date']);
        $this->assertSame([
            'insurance_side' => 'own',
            'policy_number' => 'POLICY-001',
            'claim_number' => 'CLAIM-001',
        ], $insurance['metadata']);

        $police = $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'other', 'entity_type' => 'police',
            'relation_type' => 'police', 'relationship' => '警察署',
            'name' => '大阪府〇〇警察署', 'contact_person' => '山田',
            'reference_number' => 'OSK-2026-001',
            'relation_status' => 'past', 'is_current' => false,
            'metadata' => ['department' => '交通課', 'policy_number' => 'must be removed'],
        ])->assertCreated()->json('party');
        $this->assertNull($police['relation_status']);
        $this->assertNull($police['is_current']);
        $this->assertSame(['department' => '交通課'], $police['metadata']);

        $opponentCompany = $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'opponent', 'entity_type' => 'company',
            'relation_type' => 'opponent_company', 'relationship' => '相手方企業（加害者側会社）',
            'name' => '株式会社相手方運輸', 'contact_person' => '事故担当者',
            'phone' => '06-0000-0000', 'email' => 'accident@example.test',
            'address' => '大阪府大阪市', 'relation_status' => 'current',
            'is_current' => true, 'start_date' => '2026-01-01',
            'metadata' => [
                'driver_name' => '運転 太郎',
                'vehicle_info' => '普通乗用車・白',
                'vehicle_number' => '大阪 300 あ 12-34',
                'accident_relationship' => '業務中に事故を起こした車両の所有会社',
                'policy_number' => 'must be removed',
            ],
        ])->assertCreated()->json('party');
        $this->assertNull($opponentCompany['relation_status']);
        $this->assertNull($opponentCompany['is_current']);
        $this->assertNull($opponentCompany['start_date']);
        $this->assertSame([
            'driver_name' => '運転 太郎',
            'vehicle_info' => '普通乗用車・白',
            'vehicle_number' => '大阪 300 あ 12-34',
            'accident_relationship' => '業務中に事故を起こした車両の所有会社',
        ], $opponentCompany['metadata']);

        $this->patchJson("/api/case-files/{$case['id']}/parties/{$opponentCompany['id']}", [
            'phone' => '06-1111-2222',
        ])->assertOk()
            ->assertJsonPath('party.relation_type', 'opponent_company')
            ->assertJsonPath('party.phone', '06-1111-2222');
        $this->assertDatabaseCount('case_parties', 7);

        $other = $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'other', 'entity_type' => 'other',
            'relation_type' => 'other', 'relationship' => '支援団体',
            'name' => '〇〇組合', 'contact_person' => '佐藤',
            'metadata' => ['department' => 'must be removed'],
        ])->assertCreated()->json('party');
        $this->assertNull($other['metadata']);

        $parties = collect($this->getJson("/api/case-files/{$case['id']}/workspace")
            ->assertOk()->json('case_file.parties'))
            ->keyBy('name');

        $this->assertSame('current_employer', $parties['株式会社東大阪テクノ']['relation_type']);
        $this->assertSame('dispatch_company', $parties['株式会社関西ワークサポート']['relation_type']);
        $this->assertSame('dispatch_destination', $parties['株式会社大阪工業']['relation_type']);
        $this->assertSame('own_insurer', $parties['東京海上テスト']['relation_type']);
        $this->assertSame('police', $parties['大阪府〇〇警察署']['relation_type']);
        $this->assertSame('opponent_company', $parties['株式会社相手方運輸']['relation_type']);
        $this->assertSame('other', $parties['〇〇組合']['relation_type']);
    }

    public function test_related_entity_rejects_invalid_type_specific_metadata(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $case = $this->createCase($this->userWithRole('level_5'));

        $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'insurer', 'entity_type' => 'insurer',
            'relation_type' => 'own_insurer', 'name' => 'Invalid insurer',
            'metadata' => ['insurance_side' => 'workplace'],
        ])->assertUnprocessable()->assertJsonValidationErrors(['metadata.insurance_side']);
    }

    public function test_related_entity_cannot_be_updated_through_another_case(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $user = $this->userWithRole('level_5');
        $first = $this->createCase($user, 'First');
        $second = $this->createCase($user, 'Second');
        $party = $this->postJson("/api/case-files/{$first['id']}/parties", [
            'party_type' => 'other', 'name' => 'Related organization',
        ])->assertCreated()->json('party');

        $this->patchJson("/api/case-files/{$second['id']}/parties/{$party['id']}", ['name' => 'Wrong case'])
            ->assertNotFound();
        $this->assertDatabaseHas('case_parties', ['id' => $party['id'], 'name' => 'Related organization']);
    }

    public function test_new_case_creation_persists_birth_date_and_memo(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $user = $this->userWithRole('level_5');
        $case = $this->actingAs($user, 'sanctum')->postJson('/api/case-files', [
            'title' => 'Date test', 'case_type_id' => CaseType::query()->where('name', '労災')->sole()->id,
            'summary' => '相談メモ',
            'client' => ['name' => 'Birth Date Client', 'birth_date' => '1998-04-12'],
        ])->assertCreated()->assertJsonPath('case_file.client.birth_date', '1998-04-12')->json('case_file');

        $this->assertDatabaseHas('case_files', ['id' => $case['id'], 'summary' => '相談メモ']);
    }

    public function test_new_case_transaction_rolls_back_client_when_case_insert_fails(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $user = $this->userWithRole('level_5');
        CaseFile::creating(fn () => throw new RuntimeException('Simulated case insert failure'));

        try {
            $this->withoutExceptionHandling()->actingAs($user, 'sanctum')->postJson('/api/case-files', [
                'title' => 'Rollback test', 'case_type_id' => CaseType::query()->where('name', '労災')->sole()->id,
                'client' => ['name' => 'Rollback Client', 'birth_date' => '1998-04-12'],
            ]);
            $this->fail('Expected the case insertion to fail.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Simulated case insert failure', $exception->getMessage());
        } finally {
            CaseFile::flushEventListeners();
        }

        $this->assertDatabaseMissing('clients', ['name' => 'Rollback Client']);
    }

    public function test_view_only_user_cannot_modify_incident_or_related_entities(): void
    {
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class]);
        $case = $this->createCase($this->userWithRole('level_5'));
        $viewer = $this->userWithRole('level_2');
        $this->actingAs($viewer, 'sanctum')->patchJson("/api/case-files/{$case['id']}/incident", [
            'incident_summary' => 'Unauthorized',
        ])->assertForbidden();
        $this->postJson("/api/case-files/{$case['id']}/parties", [
            'party_type' => 'other', 'name' => 'Unauthorized',
        ])->assertForbidden();
    }

    public function test_unauthenticated_incident_update_is_rejected(): void
    {
        $this->patchJson('/api/case-files/1/incident', ['incident_summary' => 'Unauthorized'])
            ->assertUnauthorized();
    }
}
