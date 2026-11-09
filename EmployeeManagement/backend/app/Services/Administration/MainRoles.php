<?php

namespace App\Services\Administration;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Validation\ValidationException;

final class MainRoles
{
    public const NAMES = ['admin', 'lawyer', 'legal_assistant', 'staff', 'part_time'];

    private const PERSONAL = [
        'attendance.view_own', 'attendance.update_own', 'attendance.export_own',
        'task.view_own', 'task.update',
    ];

    private const CASE_WORK = [
        'employee.view', 'case.view', 'case.create', 'case.update', 'document.view',
        'approval.view', 'approval.submit', 'ai.use',
    ];

    private const PROFESSIONAL = [
        'document.create', 'document.update', 'task.create', 'task.assign', 'task.manage',
        'approval.approve', 'task.review', 'interpretation.view', 'interpretation.create',
        'interpretation.update', 'interpretation.assign', 'interpretation.transition', 'interpretation.cancel',
    ];

    public static function baseline(string $name): array
    {
        return match ($name) {
            'admin' => array_values(array_unique([...self::PERSONAL, ...self::CASE_WORK, ...self::PROFESSIONAL,
                ...AdminCapabilities::ESSENTIAL, 'employee.update', 'settings.manage', 'case.assign', 'case.delete',
                'document.delete', 'task.view_all', 'task.delete', 'attendance.view_all', 'attendance.export_all',
                'attendance.update_all', 'interpretation.view_costs'])),
            'lawyer' => [...self::PERSONAL, ...self::CASE_WORK, ...self::PROFESSIONAL, 'case.assign', 'case.delete',
                'document.delete', 'task.view_all', 'interpretation.view_costs'],
            'legal_assistant' => [...self::PERSONAL, ...self::CASE_WORK, ...self::PROFESSIONAL, 'employee.manage_roles'],
            'staff' => [...self::PERSONAL, ...self::CASE_WORK, 'employee.manage_roles'],
            'part_time' => [...self::PERSONAL, 'case.view', 'document.view'],
        };
    }

    public static function assigned(?User $user): bool
    {
        return $user !== null && $user->roles()->whereIn('name', self::NAMES)->exists();
    }

    public static function installed(): bool
    {
        return Role::whereIn('name', self::NAMES)->count() === count(self::NAMES);
    }

    public static function assignableNames(User $actor): array
    {
        return match (true) {
            AdminCapabilities::isCanonicalAdmin($actor) => ['lawyer', 'legal_assistant', 'staff', 'part_time'],
            $actor->hasRole('legal_assistant') => ['staff', 'part_time'],
            $actor->hasRole('staff') => ['part_time'],
            default => [],
        };
    }

    /** The role names and baseline grants are explicit. Existing shared grants require review. */
    public static function install(): Role
    {
        foreach (self::NAMES as $name) {
            $baseline = self::baseline($name);
            $role = Role::firstOrCreate(['name' => $name], ['display_name' => strtoupper($name)]);
            $existing = $role->permissions()->pluck('name')->all();
            if (array_diff($existing, $baseline) || ($role->users()->exists() && array_diff($baseline, $existing))) {
                throw ValidationException::withMessages(['roles' => "Existing role {$name} requires reconciliation."]);
            }
            $permissions = array_map(
                fn (string $permission) => Permission::firstOrCreate(['name' => $permission], ['display_name' => $permission])->id,
                $baseline,
            );
            $role->permissions()->sync($permissions);
        }

        return Role::where('name', 'admin')->firstOrFail();
    }

    /** Delegation may manage lower roles in the same office and may never promote an administrator. */
    public static function canAssign(User $actor, Role $role, User $target): bool
    {
        if ($actor->id === $target->id || ! AdminCapabilities::active($actor)
            || ! AdminCapabilities::active($target) || ! AdminCapabilities::explicit($actor, 'employee.manage_roles')
            || ! in_array($role->name, self::NAMES, true) || $role->name === 'admin'
            || AdminCapabilities::isCanonicalAdmin($target)
            || array_diff($role->permissions()->pluck('name')->all(), self::baseline($role->name))) {
            return false;
        }
        if (AdminCapabilities::isCanonicalAdmin($actor)) return true;

        $assignable = self::assignableNames($actor);
        $current = $target->role_names;
        $lowerRole = $current === [] || (count($current) === 1
            && in_array($current[0], [...$assignable, 'level_1'], true));

        return in_array($role->name, $assignable, true) && $lowerRole
            && ! AdminCapabilities::isProtectedLegalSubject($target)
            && $actor->employee?->office_id !== null && $actor->employee->office_id === $target->employee?->office_id;
    }
}
