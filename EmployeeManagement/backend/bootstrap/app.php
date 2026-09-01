<?php

use App\Http\Middleware\RequirePasswordChange;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\SecurityEventAudit;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // API authentication uses Sanctum bearer tokens.
        $middleware->append(SecurityHeaders::class);
        $middleware->append(SecurityEventAudit::class);
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*') ? null : route('login')
        );
        $middleware->alias([
            'permission' => RequirePermission::class,
            'password.changed' => RequirePasswordChange::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // API guests must receive a JSON 401 even when the client omits
        // Accept: application/json. Web routes keep Laravel's normal redirect.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, \Throwable $exception): bool =>
                $request->is('api/*') || $request->expectsJson()
        );
    })->create();
