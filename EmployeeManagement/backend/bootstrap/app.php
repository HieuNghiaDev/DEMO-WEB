<?php

use App\Http\Middleware\RequireActiveAccount;
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
        $middleware->append(\App\Http\Middleware\LocalRequestTiming::class);
        $middleware->append(SecurityEventAudit::class);
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*') ? null : route('login')
        );
        $middleware->alias([
            'account.active' => RequireActiveAccount::class,
            'permission' => RequirePermission::class,
            'password.changed' => RequirePasswordChange::class,
            'case.rehearsal' => \App\Http\Middleware\RehearsalCaseAccess::class,
        ]);
        $middleware->appendToPriorityList(
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            RequireActiveAccount::class
        );
        $middleware->appendToPriorityList(
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            \App\Http\Middleware\RehearsalCaseAccess::class
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Chat database bindings can contain office communications. Do not let
        // Laravel's debug renderer or default exception logger expose them.
        $exceptions->report(function (\Illuminate\Database\QueryException $error) {
            if (request()->is('api/internal-chat/*', 'api/me/email-change*')) {
                return false;
            }
        });
        $exceptions->render(function (\Illuminate\Database\QueryException $error, Request $request) {
            if ($request->is('api/me/email-change*')) {
                return response()->json(['message' => 'メールアドレスの変更を処理できませんでした。時間をおいて再試行してください。'], 503)
                    ->header('Cache-Control', 'no-store, private');
            }
            if (! $request->is('api/internal-chat/*')) {
                return null;
            }
            $requestId = (string) \Illuminate\Support\Str::uuid();
            \Illuminate\Support\Facades\Log::warning('internal_chat.storage_failure', [
                'request_id' => $requestId,
                'error_category' => in_array($error->errorInfo[0] ?? '', ['42S02', '42P01'], true)
                    ? 'schema_missing' : 'storage_unavailable',
            ]);
            return response()->json([
                'message' => 'チャットを読み込めませんでした。管理者にお問い合わせください。',
                'request_id' => $requestId,
            ], 503);
        });
        $exceptions->dontFlash(['token', 'challenge', 'otp', 'recovery_code', 'secret', 'setup_challenge', 'code', 'current_password']);
        // API guests must receive a JSON 401 even when the client omits
        // Accept: application/json. Web routes keep Laravel's normal redirect.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, \Throwable $exception): bool =>
                $request->is('api/*') || $request->expectsJson()
        );
    })->create();
