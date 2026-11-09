<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $actor = $request->user();
        // Re-read state: a cached auth/session model must not outlive back-office changes.
        $account = $actor instanceof User ? User::query()->find($actor->getKey()) : null;
        $employee = $account?->employee()->withTrashed()->first();
        $active = $account?->is_active && ! $account->activation_required
            && \App\Services\Administration\EmployeePasswordReset::pendingExpiry($account) !== false && ($account->employee_id === null
            || ($employee && ! $employee->trashed() && $employee->status === 'active'));

        if (! $active) {
            // Imports/raw updates bypass model events; revoke remaining sessions on first use.
            if ($actor instanceof User) {
                $actor->revokeSessions();
            }
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return new JsonResponse(['message' => 'Unauthenticated.'], 401);
        }

        if (app()->bound(\App\Services\Administration\CanonicalRbacResolver::class)
            && app(\App\Services\Administration\CanonicalRbacResolver::class)->mappingStatus($account) !== 'MAPPED_SYNTHETIC') {
            // Test rehearsal must also block auth-only business routes, not just permission middleware.
            // No binding exists in the default application or from any HTTP/client configuration.
            return new JsonResponse(['message' => 'Access mapping is required.'], 403);
        }

        $mfa = app(\App\Services\Administration\VerifiedMfaSessions::class);
        if ($mfa->required($account) && ! $mfa->token($account, $actor->currentAccessToken())) {
            return new JsonResponse(['message' => 'MFA authentication is required.'], 401);
        }

        return $next($request);
    }
}
