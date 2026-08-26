<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePasswordChange
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->must_change_password) {
            return new JsonResponse([
                'message' => '続行する前にパスワードを変更してください。',
                'code' => 'password_change_required',
            ], 403);
        }

        return $next($request);
    }
}
