<?php

namespace App\Services\Administration;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Gate;

/** No new public routes: future editors must use these policy + guard + required-audit writers. */
final class AdministrativeRoleService
{
    public function __construct(private AdminContinuityGuard $guard, private \App\Contracts\AdministrativeAuthentication $authentication) {}

    public function assign(User $actor, User $target, Role $role): void
    {
        $this->guard->run(function () use ($actor, $target, $role): void {
            $currentRole = Role::findOrFail($role->id);
            $currentTarget = User::findOrFail($target->id);
            Gate::forUser($actor->fresh())->authorize('assign', [$currentRole, $currentTarget]);
            $currentTarget->roles()->sync([$currentRole->id]);
            $this->authentication->consumeMutation($actor, 'role.assign', ['user_id' => $currentTarget->id, 'role_id' => $currentRole->id]);
        }, $target, 'administration.roles_assigned', $actor, true);
    }

    public function assignMainRole(User $actor, User $target, Role $role): void
    {
        $this->guard->run(function () use ($actor, $target, $role): void {
            $role = Role::findOrFail($role->id);
            $target = User::findOrFail($target->id);
            $scope = ['user_id' => $target->id, 'role_id' => $role->id];
            abort_unless(MainRoles::canAssign($actor, $role, $target)
                && $this->authentication->permitsMutation($actor, 'role.assign', $scope), 403);

            // Keep the existing specialist grants while replacing the main/legacy access level.
            $specialists = $target->roles()->whereIn('name', [
                'interpretation_coordinator_local', 'verified_lawyer', 'c001_owner_legal_approver', 'developer',
            ])->pluck('roles.id')->all();
            $target->roles()->sync([$role->id, ...$specialists]);
            $this->authentication->consumeMutation($actor, 'role.assign', $scope);
        }, $target, 'administration.main_role_assigned', $actor, true);
    }

    public function create(User $actor, string $name, array $permissions): Role
    {
        $role = new Role;
        return $this->guard->run(function () use ($actor, $name, $permissions, $role): Role {
            Gate::forUser($actor->fresh())->authorize('create', [Role::class, $name, $permissions]);
            $role->fill(['name' => $name, 'display_name' => $name])->save();
            $role->permissions()->sync(Permission::whereIn('name', $permissions)->pluck('id')->all());
            $this->authentication->consumeMutation($actor, 'role.create', ['name' => $name, 'permissions' => $permissions]);
            return $role;
        }, $role, 'administration.role_created', $actor, true);
    }

    public function clone(User $actor, Role $role, string $name): Role
    {
        $copy = new Role;
        return $this->guard->run(function () use ($actor, $role, $name, $copy): Role {
            $source = $role->fresh();
            Gate::forUser($actor->fresh())->authorize('clone', [$source, $name]);
            $permissions = $source->permissions()->pluck('name')->all();
            $copy->fill(['name' => $name, 'display_name' => $name])->save();
            $copy->permissions()->sync(Permission::whereIn('name', $permissions)->pluck('id')->all());
            $this->authentication->consumeMutation($actor, 'role.clone', ['role_id' => $source->id, 'name' => $name]);
            return $copy;
        }, $copy, 'administration.role_cloned', $actor, true);
    }

    public function rename(User $actor, Role $role, string $name): void
    {
        $this->guard->run(function () use ($actor, $role, $name): void {
            $role = $role->fresh();
            Gate::forUser($actor->fresh())->authorize('rename', [$role, $name]);
            $role->update(['name' => $name]);
            $this->authentication->consumeMutation($actor, 'role.rename', ['role_id' => $role->id, 'name' => $name]);
        }, $role, 'administration.role_renamed', $actor, true);
    }

    public function replacePermissions(User $actor, Role $role, array $finalPermissions): void
    {
        $this->guard->run(function () use ($actor, $role, $finalPermissions): void {
            $role = $role->fresh();
            Gate::forUser($actor->fresh())->authorize('grantPermissions', [$role, $finalPermissions]);
            $role->permissions()->sync(Permission::whereIn('name', $finalPermissions)->pluck('id')->all());
            $this->authentication->consumeMutation($actor, 'role.permissions', ['role_id' => $role->id, 'permissions' => $finalPermissions]);
        }, $role, 'administration.role_permissions', $actor, true);
    }

    public function delete(User $actor, Role $role): void
    {
        $this->guard->run(function () use ($actor, $role): void {
            Gate::forUser($actor->fresh())->authorize('delete', $role->fresh());
            $role->delete();
            $this->authentication->consumeMutation($actor, 'role.delete', ['role_id' => $role->id]);
        }, $role, 'administration.role_deleted', $actor, true);
    }
}
