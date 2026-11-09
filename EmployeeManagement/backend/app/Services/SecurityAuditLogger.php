<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\SecurityAuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;
use Illuminate\Support\Facades\DB;
use LogicException;

class SecurityAuditLogger
{
    /** Local rollout classification/catalog writes and this required audit share one transaction. */
    public function recordCaseRollout(string $digest, string $version, string $approvalRef, array $caseIds, string $backupDigest, string $backupApproval): void
    {
        if (DB::transactionLevel() < 1 || $version !== CaseAccessRollout::VERSION || $caseIds !== CaseAccessRollout::CASE_IDS
            || preg_match('/^[a-f0-9]{64}$/D', $digest) !== 1 || preg_match('/^[a-f0-9]{64}$/D', $backupDigest) !== 1) {
            throw new LogicException('Rollout audit requires its approved classification transaction.');
        }
        SecurityAuditLog::create(['event' => 'case.access.rollout_applied', 'outcome' => 'success',
            'request_method' => 'CLI', 'request_path' => 'case-access-rollout',
            'metadata' => ['manifest_sha256' => $digest, 'version' => $version, 'approval_ref' => $approvalRef,
                'case_ids' => $caseIds, 'classification' => 'NORMAL', 'memberships_created' => 0, 'role_grants_created' => 0,
                'backup_manifest_sha256' => $backupDigest, 'backup_approval_ref' => $backupApproval]]);
    }

    /** Legal registry/final-decision writes require durable same-transaction audit; never swallow errors. */
    public function recordLegalAuthority(User $actor, string $event, array $ids, array $decisionMetadata = []): void
    {
        if (DB::transactionLevel() < 1 || ! in_array($event, ['lawyer.verification_issued', 'lawyer.verification_renewed',
            'lawyer.verification_revoked', 'legal.issuer_admitted', 'legal.issuer_revoked', 'legal.delegation_issued', 'legal.delegation_revoked', 'legal.c001_approved'], true)) {
            throw new LogicException('Legal authority audit requires its registry transaction.');
        }
        $allowed = ['issuer_admission_id', 'issuer_user_id', 'issuer_employee_id', 'verification_id', 'previous_verification_id', 'delegation_id', 'subject_user_id', 'subject_employee_id',
            'case_file_id', 'case_document_id', 'case_generated_document_id', 'version', 'decision_id'];
        $metadata = ['actor_user_id' => $actor->id, 'actor_employee_id' => $actor->employee_id];
        foreach ($ids as $key => $value) {
            if (! in_array($key, $allowed, true) || ! is_int($value) || $value < 1) throw new LogicException('Invalid legal audit identity.');
            $metadata[$key] = $value;
        }
        if ($decisionMetadata !== []) {
            $keys = ['approval_policy', 'self_approval', 'step_up_required', 'step_up_method', 'decision_mode'];
            if ($event !== 'legal.c001_approved' || count($decisionMetadata) !== count($keys)
                || array_diff(array_keys($decisionMetadata), $keys) !== []
                || ! in_array($decisionMetadata['approval_policy'], [C001LegalAuthority::FINAL_APPROVAL_POLICY,
                    SmallOfficeC001AuthorityPolicy::APPROVAL_POLICY], true)
                || ! is_bool($decisionMetadata['self_approval']) || $decisionMetadata['step_up_required'] !== true
                || $decisionMetadata['step_up_method'] !== 'TOTP'
                || $decisionMetadata['decision_mode'] !== ($decisionMetadata['self_approval']
                    ? 'SELF_FINAL_APPROVAL_WITH_STEP_UP' : 'FINAL_APPROVAL_WITH_STEP_UP')) {
                throw new LogicException('Invalid C001 decision audit metadata.');
            }
            $metadata = [...$metadata, ...$decisionMetadata];
        }
        SecurityAuditLog::create(['event' => $event, 'outcome' => 'success', 'user_id' => $actor->id,
            'employee_id' => $actor->employee_id, 'request_method' => app()->runningInConsole() ? 'CLI' : request()->method(),
            'request_path' => 'legal-authority', 'metadata' => $metadata]);
    }

    /** Rehearsal only; mandatory, minimal, same transaction as the membership mutation. */
    public function recordCaseAccess(User $actor, string $event, \App\Models\CaseMembership $membership, array $before, int $delegationId): void
    {
        if (! CaseAccessService::rehearsal() || DB::transactionLevel() < 1
            || ! in_array($event, ['case.membership.granted', 'case.membership.revoked'], true)) {
            throw new LogicException('Case membership audit requires the isolated mutation transaction.');
        }
        $keys = ['case_file_id', 'user_id', 'employee_id', 'can_read', 'can_write', 'can_read_confidential',
            'expires_at', 'revoked_at', 'revision'];
        SecurityAuditLog::create(['event' => $event, 'outcome' => 'success', 'user_id' => $actor->id,
            'employee_id' => $actor->employee_id, 'request_method' => 'CLI', 'request_path' => 'case-access-rehearsal',
            'metadata' => ['actor_user_id' => $actor->id, 'membership_id' => $membership->id, 'delegation_id' => $delegationId,
                'before' => array_intersect_key($before, array_flip($keys)),
                'after' => array_intersect_key($membership->getAttributes(), array_flip($keys))]]);
    }

    /** Privileged path only: caller's mutation and audit must use the same transaction. */
    public function recordRequired(?User $actor, string $action, array $target, array $before, array $after, array $scope): void
    {
        if (DB::transactionLevel() < 1 || preg_match('/^administration\.[a-z_]+$/D', $action) !== 1) {
            throw new LogicException('Required administrative audit needs a transaction and a registered action shape.');
        }
        if (! in_array($target['type'] ?? null, ['users', 'employees', 'roles', 'permissions'], true)
            || (! is_int($target['id'] ?? null) && ($target['id'] ?? null) !== null)) {
            throw new LogicException('Required administrative audit accepts only typed resource identities.');
        }
        SecurityAuditLog::create([
            'event' => $action, 'outcome' => 'success', 'user_id' => $actor?->id,
            'employee_id' => $actor?->employee_id,
            'request_method' => app()->runningInConsole() ? 'CLI' : request()->method(),
            'request_path' => 'administration',
            'metadata' => [
                // Preserve actor identity even if the nullable audit FK is later cleared by deletion.
                'actor_user_id' => $actor?->id, 'actor_employee_id' => $actor?->employee_id,
                'target' => ['type' => $target['type'], 'id' => $target['id']],
                'before' => $this->administrativeSnapshot($before),
                'after' => $this->administrativeSnapshot($after),
                'scope' => ['domain' => 'organization', 'phase' => ($scope['phase'] ?? 'preparation') === 'legacy_compat' ? 'legacy_compat' : 'preparation', 'revision' => (int) $scope['revision']],
            ],
        ]);
    }

    private function administrativeSnapshot(array $snapshot): array
    {
        $result = [];
        foreach ($snapshot as $key => $value) {
            if (in_array($key, ['canonical_admins', 'target', 'account'], true) && is_array($value)) {
                $result[$key] = $this->administrativeSnapshot($value);
            } elseif (is_int($key) && is_array($value)) {
                $result[$key] = $this->administrativeSnapshot($value);
            } elseif (in_array($key, ['roles', 'permissions'], true) && is_array($value)) {
                $pattern = $key === 'roles' ? '/^[a-z][a-z0-9_]*$/D' : '/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/D';
                $result[$key] = array_values(array_filter($value, fn ($name) => is_string($name) && preg_match($pattern, $name) === 1));
            } elseif (in_array($key, ['id', 'user_id', 'employee_id', 'affected_user_count'], true)) {
                $result[$key] = $value === null ? null : (int) $value;
            } elseif (in_array($key, ['active', 'employee_active', 'password_change_required', 'candidate', 'exists', 'activation_required', 'mfa_ready'], true)) {
                $result[$key] = (bool) $value;
            }
        }
        return $result;
    }

    /** @var array<int, string> */
    private const SENSITIVE_KEYS = [
        'authorization',
        'cookie',
        'password',
        'secret',
        'token',
        'phone',
        'date_of_birth',
        'nationality_code',
        'termination_date',
        'avatar_data',
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
