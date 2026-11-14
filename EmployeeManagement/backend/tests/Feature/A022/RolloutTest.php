<?php

namespace Tests\Feature\A022;

use App\Models\CaseMembership;
use App\Models\SecurityAuditLog;
use App\Services\CaseAccessRollout;
use App\Services\RuntimeCaseAccessSchema;
use App\Services\SecurityAuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class RolloutTest extends B21TestCase
{
    private array $manifest;
    private string $file;
    private string $digest;
    private const TARGET = ['connection' => 'sqlite', 'driver' => 'sqlite', 'database' => ':memory:'];

    protected function setUp(): void
    {
        parent::setUp();
        // Isolated fixture removes only the older rehearsal shape, never project data.
        Schema::drop('case_memberships');
        Schema::table('case_files', fn ($table) => $table->dropColumn('is_confidential'));
        // Build the rollout contract from synthetic SQLite records.
        $this->manifest = [
            'version' => CaseAccessRollout::VERSION,
            'approval_ref' => 'owner-a02.2-20261026-1311cffa',
            'approved_at' => '2026-10-26',
            'target' => self::TARGET,
            'memberships' => [],
            'role_grants' => [],
            'register_permissions' => ['case.manage_access'],
        ];
        foreach (CaseAccessRollout::CASE_IDS as $id) {
            $case = $this->matter();
            $case->forceFill(['id' => $id])->save();
        }
        $rows = DB::table('case_files')->orderBy('id')->get(['id', 'client_id', 'case_type_id', 'assigned_employee_id', 'status', 'deleted_at']);
        $this->manifest['cases'] = $rows->map(fn ($row) => ['case_id' => $row->id, 'classification' => 'NORMAL', 'baseline' => (array) $row])->all();
        $file = tempnam(storage_path(), 'a022-');
        $this->assertNotFalse($file);
        $this->file = $file;
        $this->writeManifest();
    }

    protected function tearDown(): void
    {
        if (isset($this->file)) {
            unlink($this->file);
        }
        if (isset($this->app)) $this->app->maintenanceMode()->deactivate();
        parent::tearDown();
    }

    private function writeManifest(): void
    {
        file_put_contents($this->file, json_encode($this->manifest, JSON_THROW_ON_ERROR));
        $this->digest = hash_file('sha256', $this->file);
    }

    private function runner(): CaseAccessRollout
    {
        return CaseAccessRollout::fromFile($this->file, $this->digest);
    }

    private function receipt(): array
    {
        return ['manifest_sha256' => $this->digest, 'target' => self::TARGET,
            'independent_backup_verified' => true, 'restore_verified' => true,
            'workers_paused' => true, 'writes_quiesced' => true,
            'backup_manifest_sha256' => hash('sha256', 'SYNTHETIC-BACKUP-NOT-REAL'), 'approval_ref' => 'synthetic-apply-approval'];
    }

    public function test_dry_run_is_default_read_only_and_does_not_create_schema_audit_or_grants(): void
    {
        DB::enableQueryLog(); DB::flushQueryLog();
        try {
            $result = $this->runner()->dryRun();
            $writes = collect(DB::getQueryLog())->filter(fn ($q) => preg_match('/^\s*(insert|update|delete|create|alter|drop|replace)\b/i', $q['query']));
            $this->assertCount(0, $writes);
        } finally { DB::disableQueryLog(); }
        $this->assertSame('DRY_RUN', $result['mode']);
        $this->assertSame(19, $result['normal']);
        $this->assertFalse(Schema::hasColumn('case_files', 'is_confidential'));
        $this->assertFalse(Schema::hasTable('case_memberships'));
        $this->assertDatabaseCount('security_audit_logs', 0);
    }

    public function test_ram_apply_writes_only_approved_normal_rows_catalog_and_required_audit(): void
    {
        $reader = $this->fixtureUser('rollout-normal', ['case.view']);
        $this->app->maintenanceMode()->activate([]);
        $this->assertSame('APPLIED', $this->runner()->apply($this->receipt())['mode']);
        $this->assertSame(19, DB::table('case_files')->where('is_confidential', false)->count());
        $this->assertDatabaseCount('case_memberships', 0);
        $this->assertDatabaseCount('security_audit_logs', 1);
        $this->assertSame($this->digest, SecurityAuditLog::sole()->metadata['manifest_sha256']);
        $this->assertFalse($reader->fresh()->hasPermission('case.manage_access'));
        $this->assertSame(CaseAccessRollout::CASE_IDS, \App\Models\CaseFile::visibleTo($reader)->orderBy('id')->pluck('id')->all());
        $this->assertTrue(app()->isDownForMaintenance());
        $this->expectException(LogicException::class);
        $this->runner()->apply($this->receipt()); // Repeated execution is fail-closed, never a second audit.
    }

    public function test_audit_failure_rolls_back_classifications_and_catalog_but_preserves_staged_schema(): void
    {
        $this->app->maintenanceMode()->activate([]);
        $this->mock(SecurityAuditLogger::class)->shouldReceive('recordCaseRollout')->once()->andThrow(new LogicException('Synthetic audit failure'));
        try {
            $this->runner()->apply($this->receipt());
            $this->fail('Audit failure must abort.');
        } catch (LogicException $error) {
            $this->assertSame('Synthetic audit failure', $error->getMessage());
            $this->assertSame(19, DB::table('case_files')->whereNull('is_confidential')->count());
            $this->assertDatabaseMissing('permissions', ['name' => 'case.manage_access']);
            $this->assertDatabaseCount('security_audit_logs', 0);
            $this->assertTrue(app()->isDownForMaintenance());
        }
    }

    public static function rejectedStates(): array
    {
        return array_map(fn ($state) => [$state], ['wrong_digest', 'unresolved', 'duplicate_case', 'extra_case',
            'missing_case', 'assignment_drift', 'unexpected_classification', 'malformed_column', 'malformed_table',
            'unexpected_target', 'unexpected_membership', 'unexpected_permission_grant']);
    }

    #[DataProvider('rejectedStates')]
    public function test_preflight_rejects_drift_and_malformed_inputs_without_writing(string $state): void
    {
        if ($state === 'unresolved') $this->manifest['cases'][0]['classification'] = 'UNRESOLVED';
        if ($state === 'duplicate_case') $this->manifest['cases'][1]['case_id'] = 21;
        if ($state === 'extra_case') $this->matter();
        if ($state === 'missing_case') DB::table('case_files')->where('id', 21)->delete();
        if ($state === 'assignment_drift') DB::table('case_files')->where('id', 21)->update(['assigned_employee_id' => $this->actor('drift', null)->employee_id]);
        if ($state === 'unexpected_classification') Schema::table('case_files', fn ($t) => $t->boolean('is_confidential')->nullable());
        if ($state === 'unexpected_classification') DB::table('case_files')->where('id', 21)->update(['is_confidential' => true]);
        if ($state === 'malformed_column') Schema::table('case_files', fn ($t) => $t->string('is_confidential')->nullable());
        if ($state === 'malformed_table') Schema::create('case_memberships', fn ($t) => $t->id());
        if ($state === 'unexpected_target') $this->manifest['target']['database'] = 'wrong-target';
        if ($state === 'unexpected_membership') {
            RuntimeCaseAccessSchema::create(self::TARGET);
            $user = $this->fixtureUser('existing-member', ['case.view']);
            CaseMembership::forceCreate(['case_file_id' => 21, 'user_id' => $user->id, 'employee_id' => $user->employee_id,
                'can_read' => true, 'can_read_confidential' => true, 'can_write' => false, 'granted_by' => $user->id,
                'evidence_ref' => 'synthetic-only', 'expires_at' => null, 'revision' => 1]);
        }
        if ($state === 'unexpected_permission_grant') $this->fixtureUser('existing-grant', ['case.manage_access']);
        $this->writeManifest();
        $this->expectException(LogicException::class);
        CaseAccessRollout::fromFile($this->file, $state === 'wrong_digest' ? str_repeat('0', 64) : $this->digest)->dryRun();
    }

    public function test_apply_requires_backup_receipt_and_real_maintenance_state_before_any_ddl(): void
    {
        foreach ([[], $this->receipt()] as $receipt) {
            try {
                $this->runner()->apply($receipt);
                $this->fail('Apply without prerequisites must fail.');
            } catch (LogicException) {
                $this->assertFalse(Schema::hasColumn('case_files', 'is_confidential'));
                $this->assertDatabaseCount('security_audit_logs', 0);
            }
        }
    }

    public function test_proposal_requires_explicit_target_before_ddl(): void
    {
        $this->expectException(LogicException::class);
        (require database_path('proposals/create_runtime_case_access.php'))->up();
    }

    public static function invalidIntegrity(): array
    {
        return array_map(fn ($value) => [$value], ['wrong_employee', 'self_issuer', 'bad_evidence', 'bad_flags', 'bad_revision', 'missing_unique']);
    }

    #[DataProvider('invalidIntegrity')]
    public function test_schema_integrity_rejects_invalid_membership_evidence_and_identity(string $state): void
    {
        RuntimeCaseAccessSchema::create(self::TARGET);
        $target = $this->fixtureUser('integrity-target', ['case.view']);
        $issuer = $this->fixtureUser('integrity-issuer', ['case.manage_access']);
        $values = ['case_file_id' => 21, 'user_id' => $target->id, 'employee_id' => $target->employee_id,
            'granted_by' => $issuer->id, 'can_read' => true, 'can_write' => false, 'can_read_confidential' => true,
            'expires_at' => null, 'evidence_ref' => 'synthetic-owner-evidence', 'revision' => 1];
        if ($state === 'wrong_employee') $values['employee_id'] = $issuer->employee_id;
        if ($state === 'self_issuer') $values['granted_by'] = $target->id;
        if ($state === 'bad_evidence') $values['evidence_ref'] = 'unapproved free text';
        if ($state === 'bad_flags') $values['can_read'] = 2;
        if ($state === 'bad_revision') $values['revision'] = 0;
        DB::table('case_memberships')->insert($values);
        if ($state === 'missing_unique') Schema::table('case_memberships', fn ($t) => $t->dropUnique(['case_file_id', 'user_id']));
        $this->expectException(LogicException::class);
        RuntimeCaseAccessSchema::validate();
    }

    public function test_backup_attestation_must_match_manifest_and_all_safety_confirmations(): void
    {
        $this->app->maintenanceMode()->activate([]);
        foreach (['manifest_sha256', 'target', 'independent_backup_verified', 'restore_verified', 'workers_paused', 'writes_quiesced', 'backup_manifest_sha256', 'approval_ref'] as $field) {
            $receipt = $this->receipt();
            unset($receipt[$field]);
            try {
                $this->runner()->apply($receipt);
                $this->fail('Incomplete backup approval must fail: '.$field);
            } catch (LogicException $error) {
                $this->assertSame('Verified independent backup and maintenance approval receipt required.', $error->getMessage());
                $this->assertFalse(Schema::hasColumn('case_files', 'is_confidential'));
            }
        }
    }

    public function test_socket_override_is_rejected_before_any_connection_query(): void
    {
        $manager = DB::getFacadeRoot();
        $connection = \Mockery::mock(\Illuminate\Database\SQLiteConnection::class);
        foreach (['url', 'read', 'write'] as $key) $connection->shouldReceive('getConfig')->with($key)->once()->andReturn(null);
        $connection->shouldReceive('getConfig')->with('unix_socket')->once()->andReturn('/synthetic/unapproved.sock');
        $connection->shouldNotReceive('select');
        DB::shouldReceive('connection')->once()->andReturn($connection);
        $this->expectException(LogicException::class);
        try {
            RuntimeCaseAccessSchema::assertTarget(self::TARGET);
        } finally {
            DB::swap($manager);
        }
    }
}
