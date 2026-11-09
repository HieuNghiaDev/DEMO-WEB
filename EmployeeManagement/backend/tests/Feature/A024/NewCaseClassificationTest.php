<?php

namespace Tests\Feature\A024;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Services\CaseWorkspaceAuditService;
use App\Services\GoogleDriveProvisioningService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\B21\B21TestCase;

class NewCaseClassificationTest extends B21TestCase
{
    private int $providerCalls = 0;

    protected function setUp(): void
    {
        parent::setUp();
        // Reproduce the active local schema, not the older SQLite fixture default false.
        Schema::table('case_files', fn ($table) => $table->dropColumn('is_confidential'));
        Schema::table('case_files', fn ($table) => $table->boolean('is_confidential')->nullable());
        $this->actingAs($this->fixtureUser('creator', ['case.create', 'case.view', 'case.update', 'document.view']));
        // Count outside any caught provider exception, so a swallowed Mockery error cannot hide a call.
        $this->mock(GoogleDriveProvisioningService::class)->shouldReceive('provisionCaseStructure')->zeroOrMoreTimes()
            ->andReturnUsing(function () {
                $this->providerCalls++;
                throw new \RuntimeException('Synthetic offline provider');
            });
    }

    private function payload(array $extra = []): array
    {
        $type = CaseType::firstOrCreate(['name' => 'Synthetic classification'], ['is_active' => true]);
        return array_replace([
            'title' => 'Synthetic classification case', 'classification' => 'normal',
            'case_type_id' => $type->id, 'client' => ['name' => 'Synthetic client'],
        ], $extra);
    }

    private function counts(): array
    {
        return collect(['case_files', 'clients', 'client_employments', 'case_documents', 'case_tasks', 'case_activities', 'case_memberships'])
            ->mapWithKeys(fn ($table) => [$table => DB::table($table)->count()])
            ->put('provider_calls', $this->providerCalls)->all();
    }

    public function test_missing_classification_is_rejected_without_partial_writes(): void
    {
        $payload = $this->payload();
        unset($payload['classification']);
        $before = $this->counts();
        $this->postJson('/api/case-files', $payload)->assertUnprocessable()->assertJsonValidationErrors('classification');
        $this->assertSame($before, $this->counts());
    }

    public function test_invalid_classifications_are_rejected_without_partial_writes(): void
    {
        foreach ([null, '', 'NORMAL', 'garbage', false, ['normal']] as $value) {
            $before = $this->counts();
            $this->postJson('/api/case-files', $this->payload(['classification' => $value]))
                ->assertUnprocessable()->assertJsonValidationErrors('classification');
            $this->assertSame($before, $this->counts());
        }
    }

    public function test_normal_is_explicit_false_audited_and_reopenable_without_membership(): void
    {
        $providerObservation = null;
        $this->mock(GoogleDriveProvisioningService::class)->shouldReceive('provisionCaseStructure')->once()
            ->andReturnUsing(function (CaseFile $case) use (&$providerObservation) {
                $providerObservation = [DB::transactionLevel(), $case->is_confidential, $case->activities()->count()];
                throw new \RuntimeException('Synthetic offline provider');
            });
        $case = $this->postJson('/api/case-files', $this->payload())->assertCreated()->json('case_file');
        $stored = CaseFile::findOrFail($case['id']);
        $this->assertSame(false, $stored->is_confidential);
        $this->assertNotNull($stored->getRawOriginal('is_confidential'));
        // Outside the provider's caught exception boundary; only the test's transaction remains.
        $this->assertSame([1, false, 1], $providerObservation);
        $this->assertSame('normal', $stored->activities()->sole()->metadata['classification']);
        $this->assertSame('case.created', $stored->activities()->sole()->metadata['event']);
        $this->assertDatabaseCount('case_memberships', 0);
        $this->getJson('/api/case-files')->assertOk()->assertJsonFragment(['id' => $stored->id, 'title' => $stored->title]);
        $this->getJson('/api/case-files/'.$stored->id)->assertOk();
        $this->getJson('/api/case-files/'.$stored->id.'/workspace')->assertOk();
    }

    public function test_confidential_admission_is_blocked_before_client_employment_or_provider_side_effects(): void
    {
        $before = $this->counts();
        $this->postJson('/api/case-files', $this->payload([
            'classification' => 'confidential',
            'employments' => [['company_name' => 'Synthetic company', 'company_address' => 'Synthetic address', 'employment_status' => 'employed', 'is_current' => true]],
        ]))->assertStatus(409)->assertJsonPath('code', 'confidential_case_admission_pending')
            ->assertJsonPath('message', '機密案件のアクセスメンバー設定は現在準備中です。');
        $this->assertSame($before, $this->counts());
    }

    public function test_admin_and_level_cannot_bypass_pending_confidential_admission(): void
    {
        foreach (['admin', 'level_5', 'level_4'] as $role) {
            $actor = $this->fixtureUser('admission-'.$role, ['case.create', 'case.view'], $role);
            $this->actingAs($actor);
            $before = $this->counts();
            $this->postJson('/api/case-files', $this->payload(['classification' => 'confidential']))->assertStatus(409);
            $this->assertSame($before, $this->counts());
        }
    }

    public function test_unauthorized_creator_is_denied(): void
    {
        $this->actingAs($this->fixtureUser('reader', ['case.view']));
        $before = $this->counts();
        $this->postJson('/api/case-files', $this->payload())->assertForbidden();
        $this->assertSame($before, $this->counts());
    }

    public function test_unauthenticated_creator_is_denied_without_writes(): void
    {
        $this->app['auth']->forgetGuards();
        $before = $this->counts();
        $this->postJson('/api/case-files', $this->payload())->assertUnauthorized();
        $this->assertSame($before, $this->counts());
    }

    public function test_audit_failure_rolls_back_normal_case_client_and_employment_and_skips_drive(): void
    {
        $this->mock(CaseWorkspaceAuditService::class)->shouldReceive('record')->once()->andThrow(new \RuntimeException('Synthetic audit failure'));
        $before = $this->counts();
        $this->postJson('/api/case-files', $this->payload([
            'employments' => [['company_name' => 'Synthetic company', 'company_address' => 'Synthetic address', 'employment_status' => 'employed', 'is_current' => true]],
        ]))->assertStatus(500);
        $this->assertSame($before, $this->counts());
    }

    public function test_raw_boolean_override_is_not_a_classification_contract(): void
    {
        foreach ([true, false] as $value) {
            $before = $this->counts();
            $this->postJson('/api/case-files', $this->payload(['is_confidential' => $value]))
                ->assertUnprocessable()->assertJsonValidationErrors('is_confidential');
            $this->assertSame($before, $this->counts());
        }
    }

    public function test_existing_nineteen_normal_cases_and_grants_remain_unchanged(): void
    {
        for ($i = 0; $i < 19; $i++) {
            $this->matter()->forceFill(['is_confidential' => false])->save();
        }
        $before = CaseFile::orderBy('id')->get()->toArray();
        $grants = DB::table('role_permissions')->orderBy('role_id')->orderBy('permission_id')->get()->toJson();
        $this->postJson('/api/case-files', $this->payload(['classification' => 'confidential']))->assertStatus(409);
        $this->assertSame($before, CaseFile::orderBy('id')->get()->toArray());
        $this->assertSame($grants, DB::table('role_permissions')->orderBy('role_id')->orderBy('permission_id')->get()->toJson());
        $this->assertDatabaseCount('case_memberships', 0);
    }

    public function test_update_cannot_reclassify_existing_case(): void
    {
        $case = $this->matter()->forceFill(['is_confidential' => false]);
        $case->save();
        $this->putJson('/api/case-files/'.$case->id, ['classification' => 'confidential'])->assertUnprocessable()->assertJsonValidationErrors('classification');
        $this->putJson('/api/case-files/'.$case->id, ['is_confidential' => true])->assertUnprocessable()->assertJsonValidationErrors('is_confidential');
        $this->assertSame(false, $case->fresh()->is_confidential);
    }
}
