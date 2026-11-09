<?php

namespace App\Services;

use App\Models\Permission;
use App\Models\SecurityAuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;

/** One approved, zero-membership local rollout. Not a general ACL import or an HTTP writer. */
final class CaseAccessRollout
{
    public const CASE_IDS = [21, 22, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49];
    public const VERSION = 'a02.2-v1';
    private const BASELINE_FIELDS = ['id', 'client_id', 'case_type_id', 'assigned_employee_id', 'status', 'deleted_at'];

    private function __construct(private readonly array $manifest, private readonly string $digest) {}

    public static function fromFile(string $path, string $approvedDigest): self
    {
        if (preg_match('/^[a-f0-9]{64}$/D', $approvedDigest) !== 1 || ! is_file($path)
            || ! hash_equals($approvedDigest, hash_file('sha256', $path))) throw new LogicException('Manifest digest mismatch.');
        $manifest = json_decode(file_get_contents($path), true, 64, JSON_THROW_ON_ERROR);
        $ids = array_column($manifest['cases'] ?? [], 'case_id');
        if (($manifest['version'] ?? null) !== self::VERSION || $ids !== self::CASE_IDS
            || ($manifest['approval_ref'] ?? null) !== 'owner-a02.2-20261026-1311cffa'
            || ($manifest['approved_at'] ?? null) !== '2026-10-26'
            || ($manifest['memberships'] ?? null) !== [] || ($manifest['role_grants'] ?? null) !== []
            || ($manifest['register_permissions'] ?? null) !== ['case.manage_access']) {
            throw new LogicException('Manifest is outside the approved A02.2 scope.');
        }
        foreach ($manifest['cases'] as $case) {
            if (($case['classification'] ?? null) !== 'NORMAL' || ! is_array($case['baseline'] ?? null)
                || array_keys($case['baseline']) !== self::BASELINE_FIELDS || $case['baseline']['id'] !== $case['case_id']) {
                throw new LogicException('Unresolved or malformed case manifest.');
            }
        }
        return new self($manifest, $approvedDigest);
    }

    /** Reads only; default CLI mode also uses a server-side READ ONLY transaction on MySQL. */
    public function dryRun(): array
    {
        RuntimeCaseAccessSchema::assertTarget($this->manifest['target'] ?? []);
        $mysql = DB::connection()->getDriverName() === 'mysql';
        if ($mysql) {
            if (DB::transactionLevel() !== 0) throw new LogicException('Dry-run requires a dedicated connection.');
            DB::statement('SET TRANSACTION READ ONLY');
            DB::beginTransaction();
        }
        try {
            $this->preflight();
            return ['mode' => 'DRY_RUN', 'manifest_version' => self::VERSION, 'manifest_sha256' => $this->digest,
                'cases' => 19, 'normal' => 19, 'confidential' => 0, 'unresolved' => 0, 'memberships' => 0,
                'role_grants' => 0, 'schema_present' => Schema::hasColumn('case_files', 'is_confidential'),
                'apply_requires' => ['separate owner approval', 'maintenance and paused workers', 'verified independent backup receipt']];
        } finally {
            if ($mysql) DB::rollBack();
        }
    }

    public function apply(array $receipt): array
    {
        RuntimeCaseAccessSchema::assertTarget($this->manifest['target'] ?? []);
        $this->validateReceipt($receipt);
        if (! app()->isDownForMaintenance()) throw new LogicException('Maintenance must already be active; runner does not stop services.');
        $mysql = DB::connection()->getDriverName() === 'mysql';
        $locked = false;
        try {
            if ($mysql) {
                if (DB::transactionLevel() !== 0) throw new LogicException('DDL requires a dedicated non-transactional connection.');
                $locked = (int) DB::selectOne("SELECT GET_LOCK('themis.a02.2.rollout', 0) AS acquired")->acquired === 1;
                if (! $locked) throw new LogicException('Another rollout holds the lock.');
                $this->assertTransactionalTables();
            }
            $this->preflight();
            // MySQL DDL is not transactional. Failure leaves maintenance active and no automatic drop/restore.
            RuntimeCaseAccessSchema::create($this->manifest['target']);
            if ($mysql) $this->assertTransactionalTables();
            DB::transaction(function () use ($receipt): void {
                DB::table('case_files')->orderBy('id')->lockForUpdate()->get(self::BASELINE_FIELDS);
                $this->preflight(); // Recheck drift, classifications, memberships and catalog under the lock.
                $changed = DB::table('case_files')->whereIn('id', self::CASE_IDS)->whereNull('is_confidential')->update(['is_confidential' => false]);
                if ($changed !== 19) throw new LogicException('Classification write count mismatch.');
                Permission::firstOrCreate(['name' => 'case.manage_access'], ['display_name' => '案件アクセス権のメタデータを管理']);
                app(SecurityAuditLogger::class)->recordCaseRollout($this->digest, self::VERSION,
                    $this->manifest['approval_ref'], self::CASE_IDS, $receipt['backup_manifest_sha256'], $receipt['approval_ref']);
                RuntimeCaseAccessSchema::validate();
                if (DB::table('case_files')->where('is_confidential', false)->count() !== 19
                    || DB::table('case_memberships')->exists()) throw new LogicException('Rollout postcondition failed.');
                $this->assertNoCatalogGrants();
            });
            return ['mode' => 'APPLIED', 'manifest_sha256' => $this->digest, 'normal' => 19, 'memberships' => 0,
                'maintenance' => 'LEFT_ACTIVE_FOR_OWNER_VERIFICATION'];
        } finally {
            if ($locked) DB::selectOne("SELECT RELEASE_LOCK('themis.a02.2.rollout') AS released");
        }
    }

    private function preflight(): void
    {
        RuntimeCaseAccessSchema::validate();
        $actual = DB::table('case_files')->orderBy('id')->get(self::BASELINE_FIELDS)->map(fn ($row) => (array) $row)->all();
        $expected = array_column($this->manifest['cases'], 'baseline');
        if ($actual !== $expected) throw new LogicException('Case ID or baseline metadata drift.');
        if (Schema::hasColumn('case_files', 'is_confidential') && DB::table('case_files')->whereNotNull('is_confidential')->exists()) {
            throw new LogicException('Unexpected existing classifications; repeat apply is denied.');
        }
        if (Schema::hasTable('case_memberships') && DB::table('case_memberships')->exists()) throw new LogicException('Unexpected memberships.');
        $this->assertNoCatalogGrants();
        if (SecurityAuditLog::where('event', 'case.access.rollout_applied')->exists()) throw new LogicException('Existing rollout audit; manual review required.');
    }

    private function assertNoCatalogGrants(): void
    {
        if (DB::table('permissions as p')->join('role_permissions as rp', 'rp.permission_id', '=', 'p.id')
            ->where('p.name', 'case.manage_access')->exists()) throw new LogicException('Unexpected access-management grants.');
    }

    private function validateReceipt(array $receipt): void
    {
        // Operator evidence, not a claim that software can verify independent physical media or a restore.
        if (($receipt['manifest_sha256'] ?? null) !== $this->digest || ($receipt['target'] ?? null) !== $this->manifest['target']
            || ($receipt['independent_backup_verified'] ?? null) !== true || ($receipt['restore_verified'] ?? null) !== true
            || ($receipt['workers_paused'] ?? null) !== true || ($receipt['writes_quiesced'] ?? null) !== true
            || preg_match('/^[a-f0-9]{64}$/D', $receipt['backup_manifest_sha256'] ?? '') !== 1
            || preg_match('/^[A-Za-z0-9._:-]{1,80}$/D', $receipt['approval_ref'] ?? '') !== 1) {
            throw new LogicException('Verified independent backup and maintenance approval receipt required.');
        }
    }

    private function assertTransactionalTables(): void
    {
        $tables = ['case_files', 'permissions', 'role_permissions', 'security_audit_logs'];
        if (Schema::hasTable('case_memberships')) $tables[] = 'case_memberships';
        $rows = DB::table('information_schema.tables')->where('table_schema', DB::connection()->getDatabaseName())
            ->whereIn('table_name', $tables)->selectRaw('TABLE_NAME AS table_name, ENGINE AS engine')->get();
        if ($rows->count() !== count($tables) || $rows->contains(fn ($row) => strtolower($row->engine) !== 'innodb')) {
            throw new LogicException('Rollout writes/audit require InnoDB tables.');
        }
    }
}
