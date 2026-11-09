<?php

namespace App\Models\Concerns;

use App\Services\Administration\AdminContinuityGuard;

trait GuardsAdminContinuity
{
    public function save(array $options = [])
    {
        if ($this instanceof \App\Models\Role && $this->exists && $this->isDirty('name')
            && (in_array($this->name, \App\Services\Administration\AdminCapabilities::PROTECTED_ROLES, true)
                || in_array($this->getOriginal('name'), \App\Services\Administration\AdminCapabilities::PROTECTED_ROLES, true))) {
            throw \Illuminate\Validation\ValidationException::withMessages(['admin' => 'Protected roles cannot be renamed by a model writer.']);
        }
        // Ordinary login timestamps, avatars/work fields and new unprivileged records must not
        // become dependent on the administrative audit/lock path.
        $fields = match (true) {
            $this instanceof \App\Models\User => ['is_active', 'employee_id', 'email', 'login_id', 'password', 'must_change_password', 'role', 'activation_required', 'activated_at', 'pii_requires_explicit'],
            $this instanceof \App\Models\Employee => ['status'],
            default => ['name'],
        };
        if (! $this->exists || ! $this->isDirty($fields)) {
            return parent::save($options);
        }
        return app(AdminContinuityGuard::class)->run(fn () => parent::save($options), $this);
    }

    public function delete()
    {
        try {
            return app(AdminContinuityGuard::class)->run(fn () => parent::delete(), $this);
        } catch (\Throwable $error) {
            // Eloquent sets exists=false before the transaction guard/audit can reject the
            // deletion. Restore the in-memory model from the rolled-back row as well.
            $restored = $this->newQueryWithoutScopes()->find($this->getKey());
            if ($restored) {
                $this->exists = true;
                $this->setRawAttributes($restored->getAttributes(), true);
            }
            if (property_exists($this, 'forceDeleting')) {
                $this->forceDeleting = false;
            }
            throw $error;
        }
    }
}
