<?php

namespace App\Services\Administration;

use App\Contracts\AdministrativeAuthentication;
use App\Models\User;

/** B2.3/B2.4 integration seam: absence of activation/MFA proof always fails closed. */
final class UnavailableAdministrativeAuthentication implements AdministrativeAuthentication
{
    public function permitsMutation(User $actor, string $action, array $scope = []): bool
    {
        return false;
    }

    public function replacementIsReady(User $user): bool
    {
        return false;
    }

    public function consumeMutation(User $actor, string $action, array $scope = []): void
    {
        throw new \Illuminate\Auth\Access\AuthorizationException('Strong authentication is unavailable.');
    }
}
