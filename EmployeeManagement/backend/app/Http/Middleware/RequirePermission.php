<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function handle(
        Request $request,
        Closure $next,
        string ...$permissions
    ): Response {
        $user = $request->user();

        abort_unless(
            $user && $user->hasAnyPermission($permissions),
            403,
            'この操作を行う権限がありません。'
        );

        return $next($request);
    }
}
