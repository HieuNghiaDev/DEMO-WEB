<?php

namespace App\Services\Administration;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;

final class AdminCapabilities
{
    public const ESSENTIAL = ['employee.view', 'employee.create', 'employee.disable', 'employee.manage_roles', 'audit.view'];

    public const ORDINARY_GRANTABLE = [
        'employee.view', 'employee.create', 'employee.update', 'employee.disable',
        'attendance.view_own', 'attendance.update_own', 'attendance.export_own',
        'task.view_own', 'task.update', 'task.create', 'task.assign', 'task.manage', 'ai.use',
    ];

    public const PROTECTED_ROLES = ['admin', 'verified_lawyer', 'developer', 'level_5'];

    public static function isCanonicalAdmin(User $user): bool
    {
        return $user->roles()->where('name', 'admin')->pluck('name')->containsStrict('admin');
    }

    /** Denial floor for ordinary editors, never proof that this person can legally approve. */
    public static function isProtectedLegalSubject(User $user): bool
    {
        return $user->roles()->where(fn ($q) => $q->where('name', 'verified_lawyer')
            ->orWhereHas('permissions', fn ($p) => $p->where('name', 'document.approve_legal')))->exists();
    }

    public static function carriesLegalAuthority(Role $role): bool
    {
        return $role->permissions()->where('name', 'document.approve_legal')->exists();
    }

    public static function known(string $permission): bool
    {
        return preg_match('/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/D', $permission) === 1
            && Permission::where('name', $permission)->value('name') === $permission;
    }

    public static function explicit(User $user, string $permission): bool
    {
        if (app()->bound(CanonicalRbacResolver::class)) {
            return app(CanonicalRbacResolver::class)->hasPermission($user, $permission);
        }
        return self::known($permission) && $user->roles()
            ->whereHas('permissions', fn ($query) => $query->where('name', $permission))->exists();
    }

    public static function active(User $user): bool
    {
        $current = $user->fresh();
        return $current !== null && $current->is_active && ! $current->activation_required
            && ($current->employee !== null ? $current->employee->status === 'active'
                : ($current->employee_id === null && ! self::isCanonicalAdmin($current)));
    }

    public static function operational(User $user, string $permission): bool
    {
        return self::active($user) && (self::isCanonicalAdmin($user)
            ? self::explicit($user, $permission) : $user->hasPermission($permission));
    }
}
