<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use \App\Models\Concerns\GuardsAdminContinuity;
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    /**
     * Frozen pre-B2 compatibility ceiling (34-name catalog minus two developer rights).
     * Historical ceiling retained for provenance; A03 no longer uses it to grant authority.
     * Catalog growth must NEVER create authority. Every action now needs an explicit pivot.
     */
    private const LEGACY_IMPLICIT_PERMISSIONS = [
        'employee.view', 'employee.create', 'employee.update', 'employee.disable', 'employee.manage_roles',
        'attendance.view_own', 'attendance.view_all', 'attendance.update_own', 'attendance.update_all',
        'attendance.export_own', 'attendance.export_all',
        'task.view_own', 'task.view_all', 'task.create', 'task.assign', 'task.update', 'task.delete',
        'task.manage', 'task.review',
        'case.view', 'case.create', 'case.update', 'case.delete', 'case.assign',
        'document.view', 'document.create', 'document.update', 'document.delete',
        'approval.submit', 'approval.view', 'approval.approve', 'ai.use',
    ];

    // DB defaults preserve legacy rows; application-created accounts are pending by default.
    // These lifecycle/PII fields are deliberately NOT mass assignable.
    protected $attributes = [
        'activation_required' => true,
        'activated_at' => null,
        'pii_requires_explicit' => true,
    ];

    protected $fillable = [
        'employee_id',
        'login_id',
        'name',
        'email',
        'password',
        'role',
        'is_active',
        'must_change_password',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'pii_requires_explicit',
    ];

    protected $appends = [
        'role_names',
        'permission_names',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'last_login_at' => 'datetime',
            'activation_required' => 'boolean',
            'activated_at' => 'datetime',
            'pii_requires_explicit' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (User $user): void {
            if ($user->activation_required) {
                // No caller-provided/shared credential is usable while awaiting the owner.
                $user->password = bin2hex(random_bytes(32));
                $user->must_change_password = true;
                $user->pii_requires_explicit = true;
                $user->activated_at = null;
                $user->role = 'employee';
            }
        });
        static::updated(function (User $user): void {
            if ($user->wasChanged(['password', 'email', 'login_id', 'employee_id', 'activation_required'])
                && \Illuminate\Support\Facades\Schema::hasTable('authentication_challenges')) {
                $user->revokeSessions();
            }
            if ($user->wasChanged(['email', 'login_id', 'employee_id']) || ($user->wasChanged('is_active') && ! $user->is_active)) {
                $user->revokeActivationInvites();
            }
            if ($user->wasChanged('is_active') && ! $user->is_active) {
                $user->revokeSessions();
            }
        });
        static::deleting(function (User $user): void {
            $user->revokeSessions();
            $user->revokeActivationInvites();
        });
    }

    public function revokeActivationInvites(): void
    {
        // Historical credential migrations predate the additive table.
        if (\Illuminate\Support\Facades\Schema::hasTable('account_action_tokens')) {
            DB::table('account_action_tokens')->where('user_id', $this->id)->where('purpose', 'activation')
                ->whereNull('used_at')->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
        }
    }

    public function revokeSessions(): void
    {
        $this->tokens()->delete();
        if (\Illuminate\Support\Facades\Schema::hasTable('authentication_challenges')) {
            DB::table('authentication_challenges')->where('user_id', $this->id)->whereNull('used_at')->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);
        }
        DB::connection(config('session.connection') ?: $this->getConnectionName())
            ->table(config('session.table', 'sessions'))->where('user_id', $this->getKey())->delete();
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function roles(): BelongsToMany
    {
        $related = new Role;
        return new \App\Models\Relations\AdministrativeBelongsToMany($related->newQuery(), $this, 'user_roles', 'user_id', 'role_id', 'id', 'id', 'roles');
    }

    public function hasRole(string $role): bool
    {
        if ($resolver = $this->canonicalRehearsal()) {
            return $resolver->hasRole($this, $role);
        }
        // The legacy display column is not role membership. Query afresh after grant/revoke.
        return $this->roles()
            ->where('name', $role)
            ->pluck('name')->containsStrict($role);
    }

    /** @param list<string> $roles */
    public function hasAnyRole(array $roles): bool
    {
        foreach ($roles as $role) {
            if ($this->hasRole($role)) {
                return true;
            }
        }

        return false;
    }

    public function hasPermission(string $permission): bool
    {
        if ($resolver = $this->canonicalRehearsal()) {
            return $resolver->hasPermission($this, $permission);
        }
        // A registered name is necessary, but only an explicit role pivot supplies authority.
        if (! $this->isValidPermissionName($permission)
            || Permission::query()->where('name', $permission)->value('name') !== $permission) {
            return false;
        }

        return $this->roles()
            ->whereHas('permissions', fn ($query) => $query
                ->where('name', $permission))
            ->exists();
    }

    private function isValidPermissionName(string $permission): bool
    {
        return preg_match('/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/D', $permission) === 1;
    }

    /** @param list<string> $permissions */
    public function hasAnyPermission(array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($this->hasPermission($permission)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    public function getRoleNamesAttribute(): array
    {
        if ($resolver = $this->canonicalRehearsal()) {
            return $resolver->roleNames($this);
        }
        return $this->roles()->pluck('name')->all();
    }

    /** @return list<string> */
    public function getPermissionNamesAttribute(): array
    {
        if ($resolver = $this->canonicalRehearsal()) {
            return $resolver->permissionNames($this);
        }
        return $this->roles()
            ->with('permissions:id,name')
            ->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))
            ->filter(fn (string $name) => $this->isValidPermissionName($name))
            ->unique()
            ->values()
            ->all();
    }

    private function canonicalRehearsal(): ?\App\Services\Administration\CanonicalRbacResolver
    {
        $type = \App\Services\Administration\CanonicalRbacResolver::class;
        // No provider binding in production. An accidental binding outside the sandbox throws,
        // rather than silently switching authority or falling back to the legacy allow path.
        if (! app()->bound($type)) {
            return null;
        }
        $resolver = app($type);
        $resolver->assertSandbox();
        return $resolver;
    }
}
