<?php

namespace App\Contracts;

use App\Models\User;

interface AdministrativeAuthentication
{
    /** Server-verified, actor/session/action-bound MFA + step-up. Never client flags or bearer alone. */
    public function permitsMutation(User $actor, string $action, array $scope = []): bool;

    /** Consume only inside the caller's mutation transaction; audit failure rolls it back. */
    public function consumeMutation(User $actor, string $action, array $scope = []): void;

    /** Persistent readiness, not a recent-step-up TTL or the presence of an online session. */
    public function replacementIsReady(User $user): bool;
}
