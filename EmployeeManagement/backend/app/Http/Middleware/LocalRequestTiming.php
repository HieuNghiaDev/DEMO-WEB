<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Monolog\Handler\StreamHandler;
use Monolog\Level;
use Monolog\Logger;
use Symfony\Component\HttpFoundation\Response;

/** Local investigation only; never log request/response bodies or concrete URLs. */
class LocalRequestTiming
{
    private static bool $shutdownRegistered = false;
    private static ?array $pending = null;

    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->environment('local', 'testing') || ! $request->is('api/*')) {
            return $next($request);
        }

        if (! self::$shutdownRegistered) {
            register_shutdown_function([self::class, 'reportFatal']);
            self::$shutdownRegistered = true;
        }
        $previous = self::$pending;
        $id = (string) Str::uuid(); // Never trust a client-supplied ID in logs.
        self::$pending = ['id' => $id, 'request' => $request, 'started' => hrtime(true), 'reported' => false];
        try {
            $response = $next($request);
            $response->headers->set('X-Request-ID', $id);
            if ($response->getStatusCode() >= 400) {
                self::record($response->getStatusCode() >= 500 ? 'http_5xx' : 'http_4xx');
            } elseif ((hrtime(true) - self::$pending['started']) / 1_000_000 >= 1000) {
                self::record('slow_request');
            }
            return $response;
        } catch (\Throwable $error) {
            self::record('exception');
            throw $error;
        } finally {
            self::$pending = $previous;
        }
    }

    /** Best-effort fatal-shutdown hook; accepts an error array for isolated tests. */
    public static function reportFatal(?array $error = null): void
    {
        $error ??= error_get_last();
        if (self::$pending === null || $error === null || ! in_array($error['type'] ?? null, [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE], true)) {
            return;
        }
        self::record(str_contains((string) ($error['message'] ?? ''), 'Maximum execution time') ? 'execution_timeout' : 'fatal_error');
    }

    private static function record(string $category): void
    {
        if (self::$pending === null || self::$pending['reported']) {
            return;
        }
        self::$pending['reported'] = true;
        $request = self::$pending['request'];
        $method = $request->method();
        $context = [
            'request_id' => self::$pending['id'],
            'route' => $request->route()?->uri() ?? '<unresolved>',
            'method' => in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], true) ? $method : 'OTHER',
            'duration_ms' => round((hrtime(true) - self::$pending['started']) / 1_000_000, 2),
            'error_category' => $category,
        ];
        try {
            // Do not use Log::build: Laravel adds shared context/processors even
            // to on-demand channels. This logger has no processors or listeners.
            $logger = new Logger('local-request-timing', [new StreamHandler(storage_path('logs/local-request-timing.log'), Level::Notice)]);
            $logger->notice('local.request_timing', $context);
            $logger->close();
        } catch (\Throwable) {
            // Diagnostics must never alter authentication, response or original error.
        }
    }
}
