<?php

namespace App\Services\Administration;

use App\Contracts\AdministrativeAuthentication;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

final class TotpAdministrativeAuthentication implements AdministrativeAuthentication
{
    public function __construct(private readonly VerifiedMfaSessions $sessions) {}

    public function permitsMutation(User $actor, string $action, array $scope = []): bool
    {
        $sessionActor = request()->user();
        $token = $sessionActor instanceof User && $sessionActor->id === $actor->id
            ? $this->sessions->token($actor, $sessionActor->currentAccessToken()) : null;
        return $token !== null && $this->sessions->proof($actor, $token, $action, $scope) !== null;
    }

    public function consumeMutation(User $actor, string $action, array $scope = []): void
    {
        $sessionActor = request()->user();
        $token = $sessionActor instanceof User && $sessionActor->id === $actor->id
            ? $this->sessions->token($actor, $sessionActor->currentAccessToken()) : null;
        $proof = $token ? $this->sessions->proof($actor, $token, $action, $scope) : null;
        if (! $proof || DB::transactionLevel() < 1 || DB::table('authentication_challenges')->where('id', $proof->id)
            ->whereNull('used_at')->whereNull('revoked_at')->update(['used_at' => now()]) !== 1) {
            throw new AuthorizationException('Fresh action-bound step-up is required.');
        }
    }

    public function replacementIsReady(User $user): bool
    {
        return $this->sessions->ready($user);
    }
}
