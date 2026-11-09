<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

final class TaskVisibility
{
    /** Shared assignment rule for both task domains; their route/case gates still apply. */
    public static function scopeAssignment(Builder $query, ?User $user, string $assigneeColumn): Builder
    {
        $id = self::visibleEmployeeId($user);
        if ($id !== null) $query->where($query->getModel()->qualifyColumn($assigneeColumn), $id);
        return $query;
    }

    public static function canViewAssignee(?User $user, ?int $employeeId): bool
    {
        $id = self::visibleEmployeeId($user);
        return $id === null || ($employeeId !== null && $id > 0 && $id === $employeeId);
    }

    private static function visibleEmployeeId(?User $user): ?int
    {
        if (! $user) return -1;
        if ($user->hasPermission('task.view_all')) return null;
        $employee = $user->employee;
        return $employee?->status === 'active' ? $employee->id : -1;
    }
}
