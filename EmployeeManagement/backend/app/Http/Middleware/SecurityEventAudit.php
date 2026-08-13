<?php

namespace App\Http\Middleware;

use App\Services\SecurityAuditLogger;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class SecurityEventAudit
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAuditLogger
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        if (! $request->is('api/*')) {
            return $response;
        }

        $event = match ($response->getStatusCode()) {
            401 => 'auth.request.unauthenticated',
            403 => 'authorization.request.denied',
            429 => 'security.rate_limit.exceeded',
            default => null,
        };

        if ($event !== null && $this->shouldRecord($request, $event)) {
            $this->securityAuditLogger->record(
                request: $request,
                event: $event,
                outcome: 'failure',
                metadata: [
                    'status_code' => $response->getStatusCode(),
                ]
            );
        }

        return $response;
    }

    private function shouldRecord(Request $request, string $event): bool
    {
        $deduplicationKey = implode('|', [
            $event,
            $request->ip(),
            $request->method(),
            $request->path(),
            $request->user()?->getAuthIdentifier(),
        ]);

        return Cache::add(
            'security-audit:'.hash('sha256', $deduplicationKey),
            true,
            now()->addMinute()
        );
    }
}
