<?php

namespace App\Policies;

use App\Models\Employee;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;

class EmployeePolicy
{
    public function viewAny(User $actor): bool
    {
        return AdminCapabilities::operational($actor, 'employee.view');
    }

    public function create(User $actor): bool
    {
        return AdminCapabilities::operational($actor, 'employee.create');
    }

    public function updateWorkData(User $actor, Employee $employee): bool
    {
        return ! $employee->trashed() && AdminCapabilities::operational($actor, 'employee.update');
    }

    public function viewPrivate(User $actor, Employee $employee): bool
    {
        return $this->viewPrivateSubject($actor, $employee) && $this->viewPrivateDirectory($actor);
    }

    /** Actor-wide eligibility only; never sufficient to serialize a particular target's PII. */
    public function viewPrivateDirectory(User $actor): bool
    {
        // Explicit PII grant, never employee.update, a Level or the legacy admin shortcut.
        return AdminCapabilities::active($actor)
            && AdminCapabilities::explicit($actor, 'employee.view_private');
    }

    /**
     * Shared private-read subject boundary. No operational HR mapping is approved yet.
     * Self is a scope restriction, not a grant: viewPrivateDirectory must also allow the actor.
     */
    public function viewPrivateSubject(User $actor, Employee $employee): bool
    {
        if ($employee->trashed() || ! $employee->getKey() || $actor->employee_id === null
            || (int) $actor->employee_id !== (int) $employee->getKey()) {
            return false;
        }

        // At most the one self row needs this query. A stale loaded actor/Employee
        // relation must not keep access after its persisted identity binding changes.
        return User::query()->whereKey($actor->getKey())->where('employee_id', $employee->getKey())
            ->where('is_active', true)->exists();
    }

    public function disable(User $actor, Employee $employee): bool
    {
        return AdminCapabilities::operational($actor, 'employee.disable')
            && $actor->employee_id !== $employee->id
            && (! $employee->user || ! AdminCapabilities::isCanonicalAdmin($employee->user));
    }

    public function issueInvite(User $actor, Employee $employee): bool
    {
        return $this->eligibleInviteTarget($actor, $employee)
            && AdminCapabilities::active($actor) && AdminCapabilities::explicit($actor, 'employee.activation.manage');
    }

    public function issueInviteAsAdmin(User $actor, Employee $employee): bool
    {
        return $this->eligibleInviteTarget($actor, $employee) && ! $actor->must_change_password
            && AdminCapabilities::isCanonicalAdmin($actor) && AdminCapabilities::active($actor)
            && ! AdminCapabilities::isProtectedLegalSubject($employee->user);
    }

    private function eligibleInviteTarget(User $actor, Employee $employee): bool
    {
        $target = $employee->user;
        return ! $employee->trashed() && $employee->status === 'active' && $target !== null
            && $target->id !== $actor->id && $target->is_active && $target->activation_required
            && $target->activated_at === null && $target->role !== 'admin'
            && ! $target->roles()->whereIn('name', AdminCapabilities::PROTECTED_ROLES)->exists();
    }
}
