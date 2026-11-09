<?php

namespace App\Services;

use App\Models\SecurityAuditLog;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Owner-approved, one-shot local activation delta for Phase 1 interpretation management.
 *
 * This deliberately has no HTTP/Artisan registration and accepts no caller-selected users,
 * roles or permissions. The CLI wrapper owns source-target, backup and maintenance gates.
 */
final class InterpretationLocalActivation
{
    public const ROLE = 'interpretation_coordinator_local';

    public const PERMISSIONS = [
        'interpretation.view',
        'interpretation.create',
        'interpretation.update',
        'interpretation.assign',
        'interpretation.transition',
        'interpretation.cancel',
    ];

    public const TARGETS = [
        ['user_id' => 10, 'employee_id' => 9],
        ['user_id' => 8, 'employee_id' => 7],
    ];

    public function __construct(private readonly SecurityAuditLogger $audit)
    {
    }

    /** @return array<string, mixed> */
    public function apply(string $approvalRef, string $backupSha256, string $migrationSha256): array
    {
        if ($approvalRef !== 'INTERPRETATION-P1-LOCAL-20261101'
            || preg_match('/^[a-f0-9]{64}$/D', $backupSha256) !== 1
            || $migrationSha256 !== 'f38e128d34ec7da51b22d7db92c171aa331d91b920aeeae8e63a5efc130a1e09') {
            throw new LogicException('Approved interpretation activation evidence is required.');
        }

        return DB::transaction(function () use ($approvalRef, $backupSha256, $migrationSha256): array {
            $users = DB::table('users')->whereIn('id', [8, 10])->lockForUpdate()->get()->keyBy('id');
            $employees = DB::table('employees')->whereIn('id', [7, 9])->lockForUpdate()->get()->keyBy('id');

            foreach (self::TARGETS as $target) {
                $user = $users->get($target['user_id']);
                $employee = $employees->get($target['employee_id']);
                if (! $user || ! $employee || (int) $user->employee_id !== $target['employee_id']
                    || ! (bool) $user->is_active || (string) $employee->status !== 'active') {
                    throw new LogicException('Approved user/employee identity is not active and exact.');
                }
            }

            if (DB::table('roles')->where('name', self::ROLE)->exists()) {
                throw new LogicException('Dedicated interpretation role already exists; refusing collision or replay.');
            }

            $permissions = DB::table('permissions')->whereIn('name', [...self::PERMISSIONS, 'interpretation.view_costs'])
                ->lockForUpdate()->get()->keyBy('name');
            foreach (self::PERMISSIONS as $permission) {
                if (! $permissions->has($permission)) {
                    throw new LogicException('Approved interpretation permission catalog is incomplete.');
                }
            }
            if (! $permissions->has('interpretation.view_costs')) {
                throw new LogicException('Expected non-grantable cost capability is missing from the catalog.');
            }

            $protectedBefore = $this->protectedSnapshot();
            $existingRoles = DB::table('user_roles')->whereIn('user_id', [8, 10])
                ->orderBy('user_id')->orderBy('role_id')->get()->map(fn ($row) => [(int) $row->user_id, (int) $row->role_id])->all();

            $roleId = DB::table('roles')->insertGetId([
                'name' => self::ROLE,
                'display_name' => '通訳管理コーディネーター（ローカル）',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach (self::PERMISSIONS as $permission) {
                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => (int) $permissions->get($permission)->id,
                ]);
            }

            $auditIds = [];
            $this->audit->recordRequired(null, 'administration.interpretation_role_created',
                ['type' => 'roles', 'id' => $roleId], [],
                ['roles' => [self::ROLE], 'permissions' => self::PERMISSIONS, 'affected_user_count' => 2],
                ['phase' => 'preparation', 'revision' => 1]);
            $auditIds[] = (int) SecurityAuditLog::query()->max('id');

            foreach (self::TARGETS as $target) {
                DB::table('user_roles')->insert(['user_id' => $target['user_id'], 'role_id' => $roleId]);
                $this->audit->recordRequired(null, 'administration.interpretation_role_granted',
                    ['type' => 'users', 'id' => $target['user_id']],
                    ['roles' => DB::table('roles')->join('user_roles', 'roles.id', '=', 'user_roles.role_id')
                        ->where('user_roles.user_id', $target['user_id'])->where('roles.id', '<>', $roleId)->orderBy('roles.name')->pluck('roles.name')->all()],
                    ['roles' => DB::table('roles')->join('user_roles', 'roles.id', '=', 'user_roles.role_id')
                        ->where('user_roles.user_id', $target['user_id'])->orderBy('roles.name')->pluck('roles.name')->all(),
                        'permissions' => self::PERMISSIONS, 'user_id' => $target['user_id'], 'employee_id' => $target['employee_id']],
                    ['phase' => 'preparation', 'revision' => 1]);
                $auditIds[] = (int) SecurityAuditLog::query()->max('id');
            }

            $oldRolesAfter = DB::table('user_roles')->whereIn('user_id', [8, 10])->where('role_id', '<>', $roleId)
                ->orderBy('user_id')->orderBy('role_id')->get()->map(fn ($row) => [(int) $row->user_id, (int) $row->role_id])->all();
            if ($existingRoles !== $oldRolesAfter || $protectedBefore !== $this->protectedSnapshot()) {
                throw new LogicException('Existing role, credential, MFA or legal authority state drifted during activation.');
            }
            if (DB::table('role_permissions')->where('role_id', $roleId)->count() !== 6
                || DB::table('role_permissions')->where('role_id', $roleId)
                    ->where('permission_id', (int) $permissions->get('interpretation.view_costs')->id)->exists()
                || DB::table('user_roles')->where('role_id', $roleId)->count() !== 2) {
                throw new LogicException('Interpretation role postcondition failed.');
            }

            return [
                'status' => 'APPLIED',
                'approval_ref' => $approvalRef,
                'backup_sha256' => $backupSha256,
                'migration_sha256' => $migrationSha256,
                'role_id' => $roleId,
                'targets' => self::TARGETS,
                'permissions' => self::PERMISSIONS,
                'audit_ids' => $auditIds,
                'existing_roles_preserved' => true,
                'view_costs_granted' => false,
            ];
        }, 1);
    }

    /** @return array<string, mixed> */
    private function protectedSnapshot(): array
    {
        $tables = ['account_mfa', 'authentication_challenges', 'mfa_recovery_codes', 'c001_legal_decisions',
            'c001_legal_proofs', 'lawyer_verifications', 'legal_delegations', 'legal_delegation_issuers'];
        $counts = [];
        foreach ($tables as $table) {
            if (DB::getSchemaBuilder()->hasTable($table)) {
                $counts[$table] = DB::table($table)->count();
            }
        }
        $users = DB::table('users')->whereIn('id', [8, 10])->orderBy('id')->get([
            'id', 'employee_id', 'password', 'is_active', 'must_change_password', 'activation_required',
        ])->map(fn ($row) => hash('sha256', json_encode((array) $row, JSON_THROW_ON_ERROR)))->all();

        return ['counts' => $counts, 'users' => $users];
    }
}
