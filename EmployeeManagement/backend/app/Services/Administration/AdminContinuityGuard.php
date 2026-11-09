<?php

namespace App\Services\Administration;

use App\Contracts\AdministrativeAuthentication;
use App\Models\Employee;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SecurityAuditLogger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use LogicException;

/** Transaction boundary, not an observer and not a replacement for resource authorization. */
final class AdminContinuityGuard
{
    private int $depth = 0;
    private ?int $bootstrapAdmission = null;

    public function __construct(private AdministrativeAuthentication $authentication, private SecurityAuditLogger $audit) {}

    /** Offline first-admin admission for the explicitly selected, existing local Manager. */
    public function installMainRolesForManager(int $userId, int $employeeId): void
    {
        $connection = DB::connection();
        if (! app()->runningInConsole() || ! app()->environment('local') || $connection->getDriverName() !== 'mysql'
            || $connection->getDatabaseName() !== 'employee_management' || $connection->getConfig('host') !== '127.0.0.1'
            || (string) $connection->getConfig('port') !== '3306' || $connection->getConfig('unix_socket')
            || $connection->getConfig('url') || $connection->getConfig('read') || $connection->getConfig('write')) {
            throw new LogicException('The main role installation requires the approved local primary database.');
        }

        $target = User::findOrFail($userId);
        DB::transaction(function () use ($target, $employeeId): void {
            $state = DB::table('security_administration_state')->where('id', 1)->lockForUpdate()->first();
            $manager = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $legacy = $manager->role_names;
            if (! $state || $state->phase !== 'preparation' || $state->admin_seen || $state->bootstrap_user_id
                || $state->bootstrap_completed_at || $this->canonicalSnapshot() !== []
                || $manager->role !== 'manager' || $manager->employee_id !== $employeeId
                || ! AdminCapabilities::active($manager) || $manager->must_change_password
                || ! in_array('level_4', $legacy, true) || array_diff($legacy, ['level_4', 'level_5'])) {
                throw ValidationException::withMessages(['admin' => 'The selected account is not the eligible local Manager.']);
            }

            $this->bootstrapAdmission = $manager->id;
            try {
                $this->run(function () use ($manager): void {
                    $admin = MainRoles::install();
                    $manager->roles()->sync([$admin->id]);
                    $manager->revokeSessions();
                    DB::table('security_administration_state')->where('id', 1)->update(['bootstrap_completed_at' => now()]);
                }, $manager, 'administration.main_roles_manager_bootstrapped', null, true);
            } finally {
                $this->bootstrapAdmission = null;
            }
        });
    }

    public function run(callable $write, Model $target, string $action = 'administration.model_mutation', ?User $actor = null, bool $requiredAudit = false): mixed
    {
        if ($target->getConnection()->getName() !== DB::connection()->getName()) {
            throw new LogicException('Administration mutations require the primary transaction connection.');
        }
        if ($this->depth > 0) {
            return $write();
        }
        // Compatible with historical migrations before RBAC/state exists. A canonical installation
        // without its guard schema must fail closed, not silently become unprotected.
        $hasCanonical = Schema::hasTable('roles') && Schema::hasTable('user_roles')
            && DB::table('roles')->where('name', 'admin')->exists();
        if (! Schema::hasTable('security_administration_state')) {
            if ($hasCanonical) {
                throw new LogicException('Administration guard schema is unavailable.');
            }
            if ($requiredAudit) {
                return $this->legacyTransaction($write, $target, $action, $actor);
            }
            return $write();
        }

        return DB::transaction(function () use ($write, $target, $action, $actor, $requiredAudit): mixed {
            $state = DB::table('security_administration_state')->where('id', 1)->lockForUpdate()->first();
            if (! $state || $state->phase !== 'preparation') {
                // B2.4 keeps preparation authority; local bootstrap is a narrowly scoped admission, not cutover.
                throw new LogicException('Unsupported administration phase; no legacy fallback.');
            }
            // Also takes a write lock on SQLite before reading the candidate set. No MySQL race claim.
            DB::table('security_administration_state')->where('id', 1)->increment('revision');
            $before = $this->canonicalSnapshot();
            $beforeTarget = $this->targetSnapshot($target);
            $identityChanged = $target instanceof User && $target->exists
                && $target->isDirty(['password', 'email', 'login_id', 'employee_id', 'must_change_password', 'activation_required', 'activated_at']);
            ++$this->depth;
            try {
                $result = $write();
                $after = $this->canonicalSnapshot();
                $this->assertSafeTransition($before, $after, (bool) $state->admin_seen, $identityChanged ? $target->getKey() : null);
                if ($after !== []) {
                    DB::table('security_administration_state')->where('id', 1)->update(['admin_seen' => true]);
                }
                $afterTarget = $this->targetSnapshot($target);
                $roleSourceChanged = ($target instanceof Role || $target instanceof Permission)
                    && ($before !== [] || $after !== []) && $beforeTarget !== $afterTarget;
                if ($requiredAudit || $before !== $after || $roleSourceChanged) {
                    $this->audit->recordRequired(
                        $actor ?? (auth()->user() instanceof User ? auth()->user() : null),
                        $action,
                        ['type' => $target->getTable(), 'id' => $target->getKey()],
                        ['canonical_admins' => $before, 'target' => $beforeTarget],
                        ['canonical_admins' => $after, 'target' => $afterTarget],
                        ['domain' => 'organization', 'phase' => 'preparation', 'revision' => $state->revision + 1],
                    );
                }
                return $result;
            } finally {
                --$this->depth;
            }
        });
    }

    /** No data migration is required to retain the existing legacy HR operations. */
    private function legacyTransaction(callable $write, Model $target, string $action, ?User $actor): mixed
    {
        return DB::transaction(function () use ($write, $target, $action, $actor): mixed {
            // This existing canonical catalog entry is the legacy-only serialization anchor.
            // Never create it/grant it as a fallback, and never use this path for Admin A.
            if (! DB::table('permissions')->where('name', 'employee.manage_roles')->lockForUpdate()->first()) {
                throw new LogicException('Legacy administration audit lock is unavailable.');
            }
            $before = $this->targetSnapshot($target);
            ++$this->depth;
            try {
                $result = $write();
                $this->assertSafeTransition([], $this->canonicalSnapshot(), false, null);
                $this->audit->recordRequired($actor, $action, ['type' => $target->getTable(), 'id' => $target->getKey()],
                    ['target' => $before], ['target' => $this->targetSnapshot($target)],
                    ['phase' => 'legacy_compat', 'revision' => 0]);
                return $result;
            } finally {
                --$this->depth;
            }
        });
    }

    private function assertSafeTransition(array $before, array $after, bool $adminSeen, ?int $identityChangedId): void
    {
        $added = array_values(array_diff(array_keys($after), array_keys($before)));
        if ($added !== [] && ! ($this->bootstrapAdmission !== null && $before === [] && ! $adminSeen && $added === [$this->bootstrapAdmission])) {
            // Admin bootstrap requires its own approved protocol; no ordinary model/pivot bootstrap.
            throw ValidationException::withMessages(['admin' => 'Admin bootstrap is not available in this phase.']);
        }
        $lost = [];
        foreach ($before as $id => $entry) {
            $next = $after[$id] ?? null;
            if ($next === null || ($entry['candidate'] && ! $next['candidate'])
                || ($entry['mfa_ready'] && ! $next['mfa_ready']) || $id === $identityChangedId) {
                $lost[] = $id;
            }
            if ($next && array_diff($next['permissions'], $entry['permissions'], AdminCapabilities::ORDINARY_GRANTABLE) !== []) {
                throw ValidationException::withMessages(['admin' => 'Protected grants require independent approval.']);
            }
        }
        if ($lost !== []) {
            $replacement = false;
            foreach ($after as $id => $entry) {
                if (! in_array($id, $lost, true) && $entry['candidate']
                    && $this->authentication->replacementIsReady(User::findOrFail($id))) {
                    $replacement = true;
                }
            }
            if (! $replacement) {
                throw ValidationException::withMessages(['admin' => 'A verified replacement administrator is required.']);
            }
        }
        if ($adminSeen && $before === []) {
            throw ValidationException::withMessages(['admin' => 'Administration continuity was lost; approved offline recovery is required.']);
        }
    }

    /** Candidates are a conservative protection floor, NEVER a claim of activated/MFA-ready admins. */
    private function canonicalSnapshot(): array
    {
        $result = [];
        foreach (User::whereHas('roles', fn ($q) => $q->where('name', 'admin'))->with(['roles.permissions', 'employee'])->orderBy('id')->get() as $user) {
            if (! $user->roles->pluck('name')->containsStrict('admin')) {
                continue;
            }
            $entry = $this->userSnapshot($user);
            $entry['candidate'] = $user->is_active && ! $user->must_change_password && ! $user->activation_required
                && $user->employee !== null && $user->employee->status === 'active'
                && array_diff(AdminCapabilities::ESSENTIAL, $entry['permissions']) === [];
            $entry['mfa_ready'] = $this->authentication->replacementIsReady($user);
            $result[$user->id] = $entry;
        }
        return $result;
    }

    private function userSnapshot(User $user): array
    {
        return ['user_id' => $user->id, 'roles' => $user->roles->pluck('name')->sort()->values()->all(),
            'permissions' => $user->roles->flatMap(fn ($role) => $role->permissions->pluck('name'))
                ->filter(fn ($name) => AdminCapabilities::known($name))->unique()->sort()->values()->all(),
            'active' => (bool) $user->is_active, 'employee_id' => $user->employee_id,
            'employee_active' => $user->employee?->status === 'active',
            'password_change_required' => (bool) $user->must_change_password,
            'activation_required' => (bool) $user->activation_required];
    }

    private function targetSnapshot(Model $target): array
    {
        $fresh = $target->fresh();
        if ($fresh instanceof User) {
            return $this->userSnapshot($fresh->load(['roles.permissions', 'employee']));
        }
        if ($fresh instanceof Employee) {
            $account = $fresh->user;
            return ['id' => $fresh->id, 'active' => ! $fresh->trashed() && $fresh->status === 'active', 'exists' => ! $fresh->trashed(),
                'account' => $account ? $this->userSnapshot($account->load(['roles.permissions', 'employee'])) : []];
        }
        if ($fresh instanceof Role) {
            return ['id' => $fresh->id, 'roles' => [$fresh->name], 'permissions' => $fresh->permissions()->pluck('name')->sort()->values()->all(),
                'affected_user_count' => $fresh->users()->count()];
        }
        if ($fresh instanceof Permission) {
            return ['id' => $fresh->id, 'permissions' => [$fresh->name], 'affected_user_count' => User::whereHas('roles.permissions', fn ($q) => $q->whereKey($fresh->id))->count()];
        }
        return ['exists' => $fresh !== null];
    }

    /** Narrow, local-only first-Admin protocol. No callback/HTTP bypass or legacy bootstrap. */
    public function completeFirstBootstrap(User $target, int $tokenId): void
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        DB::transaction(function () use ($target, $tokenId): void {
            $state = DB::table('security_administration_state')->where('id', 1)->lockForUpdate()->first();
            $user = $target->fresh();
            $sessions = app(VerifiedMfaSessions::class);
            $token = \Laravel\Sanctum\PersonalAccessToken::find($tokenId);
            $scope = ['installation_id' => $state?->installation_id, 'user_id' => $user?->id];
            $proof = $user && $token ? $sessions->proof($user, $token, 'bootstrap.finish', $scope) : null;
            if (! $state || $state->admin_seen || $state->bootstrap_completed_at
                || (int) $state->bootstrap_user_id !== $user?->id || ! $sessions->ready($user)
                || ! $proof || User::whereHas('roles', fn ($q) => $q->where('name', 'admin'))->exists()
                || $user->roles()->exists() || ! $user->pii_requires_explicit) {
                throw ValidationException::withMessages(['bootstrap' => 'Bootstrap completion is unavailable.']);
            }
            $this->bootstrapAdmission = $user->id;
            try {
                $this->run(function () use ($user, $proof): void {
                    $permissions = AdminCapabilities::ESSENTIAL;
                    $role = Role::firstOrCreate(['name' => 'admin'], ['display_name' => 'Admin']);
                    $existing = $role->permissions()->pluck('name')->all();
                    if ($existing !== [] && (array_diff($existing, $permissions) !== [] || array_diff($permissions, $existing) !== [])) {
                        throw ValidationException::withMessages(['bootstrap' => 'Existing Admin role requires reconciliation.']);
                    }
                    $ids = [];
                    foreach ($permissions as $name) {
                        $ids[] = Permission::firstOrCreate(['name' => $name], ['display_name' => $name])->id;
                    }
                    $role->permissions()->sync($ids);
                    $user->roles()->attach($role->id);
                    if (DB::table('authentication_challenges')->where('id', $proof->id)->whereNull('used_at')->whereNull('revoked_at')
                        ->update(['used_at' => now()]) !== 1) {
                        throw ValidationException::withMessages(['bootstrap' => 'Fresh bootstrap step-up is required.']);
                    }
                    DB::table('security_administration_state')->where('id', 1)->update(['bootstrap_completed_at' => now()]);
                }, $user, 'administration.first_admin_bootstrapped', $user, true);
            } finally {
                $this->bootstrapAdmission = null;
            }
        });
    }
}
