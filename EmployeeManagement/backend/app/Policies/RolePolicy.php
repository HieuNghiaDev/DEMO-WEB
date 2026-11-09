<?php

namespace App\Policies;

use App\Contracts\AdministrativeAuthentication;
use App\Models\Role;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;

class RolePolicy
{
    public function __construct(private AdministrativeAuthentication $authentication) {}

    /** Structural ceiling only; this is NOT authorization to perform a mutation. */
    public function withinGrantableCeiling(array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if (! is_string($permission) || ! AdminCapabilities::known($permission)
                || ! in_array($permission, AdminCapabilities::ORDINARY_GRANTABLE, true)) {
                return false;
            }
        }
        return true;
    }

    public function assign(User $actor, Role $role, User $target): bool
    {
        return $actor->id !== $target->id && AdminCapabilities::active($target)
            && ! AdminCapabilities::isCanonicalAdmin($target)
            && ! AdminCapabilities::isProtectedLegalSubject($target)
            && ! in_array($role->name, AdminCapabilities::PROTECTED_ROLES, true)
            && $this->withinGrantableCeiling($role->permissions()->pluck('name')->all())
            && $this->authorized($actor, 'role.assign', ['user_id' => $target->id, 'role_id' => $role->id]);
    }

    public function create(User $actor, string $name, array $permissions = []): bool
    {
        return preg_match('/^[a-z][a-z0-9_]*$/D', $name) === 1
            && ! in_array($name, AdminCapabilities::PROTECTED_ROLES, true)
            && $this->withinGrantableCeiling($permissions) && $this->authorized($actor, 'role.create', ['name' => $name, 'permissions' => $permissions]);
    }

    public function clone(User $actor, Role $role, string $name): bool
    {
        return ! in_array($role->name, AdminCapabilities::PROTECTED_ROLES, true)
            && preg_match('/^[a-z][a-z0-9_]*$/D', $name) === 1
            && ! in_array($name, AdminCapabilities::PROTECTED_ROLES, true)
            && $this->withinGrantableCeiling($role->permissions()->pluck('name')->all())
            && $this->authorized($actor, 'role.clone', ['role_id' => $role->id, 'name' => $name]);
    }

    public function rename(User $actor, Role $role, string $name): bool
    {
        return ! $role->users()->whereKey($actor->id)->exists()
            && ! in_array($role->name, AdminCapabilities::PROTECTED_ROLES, true)
            && preg_match('/^[a-z][a-z0-9_]*$/D', $name) === 1
            && ! in_array($name, AdminCapabilities::PROTECTED_ROLES, true)
            && $this->withinGrantableCeiling($role->permissions()->pluck('name')->all())
            && $this->authorized($actor, 'role.rename', ['role_id' => $role->id, 'name' => $name]);
    }

    public function grantPermissions(User $actor, Role $role, array $finalPermissions): bool
    {
        // The FINAL set, not a delta. A shared role can otherwise escalate its own editor.
        return ! in_array($role->name, AdminCapabilities::PROTECTED_ROLES, true)
            && ! AdminCapabilities::carriesLegalAuthority($role)
            && ! $role->users()->whereKey($actor->id)->exists()
            && ! $role->users()->whereHas('roles', fn ($q) => $q->where('name', 'admin'))->exists()
            && $this->withinGrantableCeiling($finalPermissions)
            && $this->authorized($actor, 'role.permissions', ['role_id' => $role->id, 'permissions' => $finalPermissions]);
    }

    public function delete(User $actor, Role $role): bool
    {
        return ! in_array($role->name, AdminCapabilities::PROTECTED_ROLES, true)
            && ! AdminCapabilities::carriesLegalAuthority($role)
            && ! $role->users()->whereKey($actor->id)->exists()
            && ! $role->users()->whereHas('roles', fn ($q) => $q->where('name', 'admin'))->exists()
            && $this->authorized($actor, 'role.delete', ['role_id' => $role->id]);
    }

    private function authorized(User $actor, string $action, array $scope): bool
    {
        return AdminCapabilities::active($actor) && AdminCapabilities::isCanonicalAdmin($actor)
            && AdminCapabilities::explicit($actor, 'employee.manage_roles')
            && $this->authentication->permitsMutation($actor, $action, $scope);
    }
}
