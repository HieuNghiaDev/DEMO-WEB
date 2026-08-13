<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\SecurityAuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class SecurityAuditLogger
{
    /** @var array<int, string> */
    private const SENSITIVE_KEYS = [
        'authorization',
        'cookie',
        'password',
        'secret',
        'token',
    ];

    public function record(
        Request $request,
        string $event,
        string $outcome,
        ?User $user = null,
        ?Employee $employee = null,
        ?string $identifier = null,
        array $metadata = []
    ): void {
        $requestUser = $request->user();

        if ($user === null && $requestUser instanceof User) {
            $user = $requestUser;
        }

        $employee ??= $user?->employee;

        $context = [
            'event' => $event,
            'outcome' => $outcome,
            'user_id' => $user?->id,
            'employee_id' => $employee?->id,
            'identifier_hash' => $this->hashIdentifier($identifier),
            'ip_address' => $request->ip(),
            'request_method' => Str::upper($request->method()),
            'request_path' => Str::limit($request->path(), 255, ''),
            'user_agent' => $this->sanitizeUserAgent($request->userAgent()),
            'metadata' => $this->sanitizeMetadata($metadata),
        ];

        try {
            SecurityAuditLog::create($context);
        } catch (Throwable $exception) {
            // Security logging must never break login or attendance workflows.
            Log::warning('Security audit persistence failed.', [
                'event' => $event,
                'outcome' => $outcome,
                'exception' => $exception::class,
            ]);
        }
    }

    private function hashIdentifier(?string $identifier): ?string
    {
        if ($identifier === null || trim($identifier) === '') {
            return null;
        }

        return hash_hmac(
            'sha256',
            Str::lower(trim($identifier)),
            (string) config('app.key')
        );
    }

    private function sanitizeUserAgent(?string $userAgent): ?string
    {
        if ($userAgent === null) {
            return null;
        }

        return Str::limit(
            str_replace(["\r", "\n"], ' ', $userAgent),
            512,
            ''
        );
    }

    private function sanitizeMetadata(array $metadata): array
    {
        $safeMetadata = [];

        foreach ($metadata as $key => $value) {
            $normalizedKey = Str::lower((string) $key);

            if ($this->isSensitiveKey($normalizedKey)) {
                continue;
            }

            $safeMetadata[$key] = is_array($value)
                ? $this->sanitizeMetadata($value)
                : $value;
        }

        return $safeMetadata;
    }

    private function isSensitiveKey(string $key): bool
    {
        foreach (self::SENSITIVE_KEYS as $sensitiveKey) {
            if (str_contains($key, $sensitiveKey)) {
                return true;
            }
        }

        return false;
    }
}
