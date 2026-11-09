<?php

namespace App\Services;

use App\Models\CaseAccessDelegation;
use App\Models\CaseFile;
use App\Models\CaseMembership;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;
use App\Services\Administration\LocalAdministrationSandbox;
use DateTimeInterface;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;

/** Shared content scope; instance grant/revoke and strict membership rehearsal remain RAM-only. */
final class CaseAccessService
{
    private const CONTENT_SCOPES = ['read', 'write', 'confidential'];

    public function __construct()
    {
        $this->assertSandbox();
    }

    /** Runtime reads do not instantiate or activate the guarded rehearsal writer. */
    public static function contentScope(Builder $query, ?User $user, string $scope = 'read'): Builder
    {
        if ($strict = self::rehearsal()) return $strict->scope($query, $user, $scope);
        if (! $query->getModel() instanceof CaseFile || ! in_array($scope, ['read', 'write'], true)) {
            throw new LogicException('Invalid case content scope.');
        }
        $current = $user?->fresh();
        if (! $current || ! $current->is_active || $current->activation_required || ! $current->hasPermission('case.view')) {
            return $query->whereRaw('1 = 0');
        }
        // Preserve existing non-employee lawful accounts for normal cases only.
        $employee = $current->employee;
        if ($current->employee_id !== null && (! $employee || $employee->status !== 'active')) return $query->whereRaw('1 = 0');
        $schema = self::runtimeSchema();
        $restricted = $current->hasRole('part_time');
        // Part-time access requires an explicit case membership, including for normal cases.
        if (! $schema['classification']) return $restricted ? $query->whereRaw('1 = 0') : $query;
        return self::membershipScope($query, $current, $scope, $restricted, $schema['memberships']);
    }

    public static function contentAllows(?User $user, int $caseId, string $scope = 'read'): bool
    {
        return self::contentScope(CaseFile::query(), $user, $scope)->whereKey($caseId)->exists();
    }

    /** Request-local schema metadata only, never role/grant decisions. */
    private static function runtimeSchema(): array
    {
        $key = 'case_access_schema.'.DB::connection()->getName().'.'.DB::connection()->getDatabaseName();
        $attributes = request()->attributes;
        if (! $attributes->has($key)) {
            $classification = Schema::hasColumn('case_files', 'is_confidential');
            $attributes->set($key, ['classification' => $classification, 'memberships' => $classification
                && Schema::hasTable('case_memberships') && Schema::hasColumns('case_memberships',
                    ['case_file_id', 'user_id', 'employee_id', 'can_read', 'can_write', 'can_read_confidential', 'expires_at', 'revoked_at'])]);
        }
        return $attributes->get($key);
    }

    /** One SQL membership predicate for runtime confidential cases and strict rehearsal. */
    private static function membershipScope(Builder $query, User $user, string $scope, bool $allCases, bool $tableReady = true): Builder
    {
        return $query->where(function (Builder $access) use ($user, $scope, $allCases, $tableReady): void {
            if (! $allCases) $access->where($access->qualifyColumn('is_confidential'), false);
            if (! $tableReady || $user->employee_id === null) {
                if ($allCases) $access->whereRaw('1 = 0');
                return;
            }
            $method = $allCases ? 'whereExists' : 'orWhereExists';
            $access->$method(function (QueryBuilder $member) use ($user, $scope, $access): void {
                $member->selectRaw('1')->from('case_memberships as content_member')
                    ->whereColumn('content_member.case_file_id', $access->qualifyColumn('id'))
                    ->where('content_member.user_id', $user->id)->where('content_member.employee_id', $user->employee_id)
                    ->where('content_member.can_read', true)->whereNull('content_member.revoked_at')
                    ->where(fn ($expiry) => $expiry->whereNull('content_member.expires_at')
                        ->orWhere('content_member.expires_at', '>', now()))
                    ->where(fn ($q) => $q->where($access->qualifyColumn('is_confidential'), false)
                        ->orWhere(fn ($secret) => $secret->where($access->qualifyColumn('is_confidential'), true)
                            ->where('content_member.can_read_confidential', true)));
                if ($scope === 'write') $member->where('content_member.can_write', true);
            });
        });
    }

    /** UI flags only; mutations call contentScope again via the parent boundary. */
    public static function presentationWrite(?User $user, ?int $caseId): bool
    {
        if (! $user || ! $caseId || $caseId < 1) return false;
        if ($strict = self::rehearsal()) return $strict->presentationAllows($user, $caseId);
        $key = 'case_content_write.'.($user?->id ?? 'guest').'.'.$caseId;
        if (! request()->attributes->has($key)) request()->attributes->set($key, self::contentAllows($user, $caseId, 'write'));
        return request()->attributes->get($key) === true;
    }

    /** Shared client identity policy is pending; suppress exclusively inaccessible case clients. */
    public static function clientsVisibleTo(Builder $query, ?User $user): Builder
    {
        if ($user?->hasRole('part_time')) {
            return $query->whereHas('caseFiles', fn ($cases) => $cases->visibleTo($user));
        }
        if (! self::runtimeSchema()['classification']) return $query;
        return $query->where(fn ($clients) => $clients->whereDoesntHave('caseFiles', fn ($cases) => $cases->withTrashed()
                ->where(fn ($classification) => $classification->where('is_confidential', true)->orWhereNull('is_confidential')))
            ->orWhereHas('caseFiles', fn ($cases) => $cases->visibleTo($user)));
    }

    public static function rehearsal(): ?self
    {
        if (! app()->bound(self::class)) return null;
        $service = app(self::class);
        $service->assertSandbox();
        return $service;
    }

    public function assertSandbox(): void
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        if (PHP_SAPI !== 'cli' || ! defined('PHPUNIT_COMPOSER_INSTALL') || ! app()->runningUnitTests()) {
            throw new LogicException('Case access rehearsal requires PHPUnit CLI SQLite RAM.');
        }
        // Inspect connection metadata, not getPdo(): cached/config-mismatched connections must fail before SQL.
        $connection = DB::connection();
        if ($connection->getDriverName() !== 'sqlite' || $connection->getDatabaseName() !== ':memory:'
            || $connection->getConfig('url') || $connection->getConfig('read') || $connection->getConfig('write')) {
            throw new LogicException('Case access requires the isolated primary SQLite :memory: connection.');
        }
    }

    private function active(?User $user): ?User
    {
        $this->assertSandbox();
        if ($user && $user->getConnectionName() !== null && $user->getConnectionName() !== config('database.default')) {
            throw new LogicException('Case access refuses a cross-connection identity.');
        }
        $current = $user?->fresh();
        if ($current && $current->is_active && ! $current->activation_required && ! $current->must_change_password
            && $current->employee_id !== null && $current->employee?->status === 'active') return $current;
        return null;
    }

    /** Apply before pagination/count/filter; no creator, assignee, Level or Admin override. */
    public function scope(Builder $query, ?User $user, string $scope = 'read'): Builder
    {
        if (! $query->getModel() instanceof CaseFile || ! in_array($scope, ['read', 'write'], true)) {
            throw new LogicException('Invalid case content scope.');
        }
        if ($query->getModel()->getConnectionName() !== null
            && $query->getModel()->getConnectionName() !== config('database.default')) {
            throw new LogicException('Case access refuses a cross-connection query.');
        }
        $current = $this->active($user);
        if (! $current || ! $current->hasPermission('case.view')) return $query->whereRaw('1 = 0');
        return self::membershipScope($query->whereNull($query->qualifyColumn('deleted_at')), $current, $scope, true);
    }

    public function allows(?User $user, int $caseId, string $scope = 'read'): bool
    {
        return $this->scope(CaseFile::query(), $user, $scope)->whereKey($caseId)->exists();
    }

    public function authorizeWrite(?User $user, int $caseId): void
    {
        if (! $this->allows($user, $caseId, 'write')) throw new AuthorizationException('Case membership is required.');
    }

    /** Response flags only. Never use this request-local snapshot to authorize a mutation. */
    public function presentationAllows(?User $user, int $caseId): bool
    {
        $this->assertSandbox();
        $snapshot = request()->attributes->get('b31_case_presentation');
        if (is_array($snapshot) && ($snapshot['user_id'] ?? null) === $user?->id
            && ($snapshot['case_id'] ?? null) === $caseId) return ($snapshot['write'] ?? false) === true;
        return $this->allows($user, $caseId, 'write');
    }

    private function delegation(User $actor, int $caseId): CaseAccessDelegation
    {
        $current = $this->active($actor);
        if (! $current || ! AdminCapabilities::explicit($current, 'case.manage_access')) throw new AuthorizationException;
        $delegation = CaseAccessDelegation::query()->where('case_file_id', $caseId)->where('user_id', $current->id)
            ->where('employee_id', $current->employee_id)->whereNull('revoked_at')->where('expires_at', '>', now())
            ->lockForUpdate()->first();
        if (! $delegation || preg_match('/^[A-Za-z0-9._:-]{1,80}$/D', $delegation->approval_ref) !== 1
            || ! is_array($delegation->grantable_scopes)
            || count(array_filter($delegation->grantable_scopes, 'is_string')) !== count($delegation->grantable_scopes)
            || array_diff($delegation->grantable_scopes, self::CONTENT_SCOPES)) throw new AuthorizationException;
        return $delegation;
    }

    /** Metadata projection contract only. Admission/writers remain guarded RAM-only; no HTTP API. */
    public function managementSnapshot(User $actor, int $caseId): array
    {
        $this->assertSandbox();
        return DB::transaction(function () use ($actor, $caseId): array {
            $delegation = $this->delegation($actor, $caseId);
            $case = CaseFile::query()->select(['id', 'is_confidential'])->findOrFail($caseId);
            return ['case_id' => $case->id,
                'classification' => $case->is_confidential === null ? 'UNKNOWN' : ($case->is_confidential ? 'CONFIDENTIAL' : 'NORMAL'),
                'management_approval_ref' => $delegation->approval_ref,
                'memberships' => CaseMembership::query()->where('case_file_id', $caseId)
                    ->select(['user_id', 'employee_id', 'can_read', 'can_write', 'can_read_confidential', 'expires_at', 'revoked_at', 'revision'])
                    ->orderBy('user_id')->get()->map(fn ($member) => [
                        'user_id' => $member->user_id, 'employee_id' => $member->employee_id,
                        'access' => ! $member->can_read || ($case->is_confidential && ! $member->can_read_confidential)
                            ? 'NONE' : ($member->can_write ? 'READ_WRITE' : 'READ'),
                        'expires_at' => $member->expires_at?->toIso8601String(),
                        'revoked_at' => $member->revoked_at?->toIso8601String(), 'revision' => $member->revision,
                    ])->all()];
        });
    }

    /** Internal rehearsal writer, not a public admission/management endpoint. */
    public function grant(User $actor, int $caseId, User $target, array $scopes, DateTimeInterface $expiresAt): CaseMembership
    {
        $this->assertSandbox();
        if ($actor->id === $target->id || ! in_array('read', $scopes, true)
            || count(array_filter($scopes, 'is_string')) !== count($scopes)
            || count(array_unique($scopes)) !== count($scopes) || array_diff($scopes, self::CONTENT_SCOPES)) {
            throw new AuthorizationException;
        }
        return DB::transaction(function () use ($actor, $caseId, $target, $scopes, $expiresAt): CaseMembership {
            // One serialization anchor for grant/revoke; never requires content membership to manage.
            CaseFile::whereKey($caseId)->lockForUpdate()->firstOrFail();
            $delegation = $this->delegation($actor, $caseId);
            $subject = $this->active($target);
            $expiry = Carbon::instance($expiresAt);
            if (! $subject || array_diff($scopes, $delegation->grantable_scopes)
                || $expiry->lte(now()) || $expiry->gt($delegation->expires_at)) throw new AuthorizationException;
            $membership = CaseMembership::query()->where('case_file_id', $caseId)->where('user_id', $subject->id)->lockForUpdate()->first()
                ?? new CaseMembership;
            if ($membership->exists) $this->assertWithinDelegation($membership, $delegation);
            $before = $membership->getAttributes();
            $membership->forceFill(['case_file_id' => $caseId, 'user_id' => $subject->id, 'employee_id' => $subject->employee_id,
                'can_read' => true, 'can_write' => in_array('write', $scopes, true),
                'can_read_confidential' => in_array('confidential', $scopes, true), 'granted_by' => $actor->id,
                'expires_at' => $expiry, 'revoked_at' => null, 'revision' => ($membership->revision ?? 0) + 1])->save();
            app(SecurityAuditLogger::class)->recordCaseAccess($actor, 'case.membership.granted', $membership, $before, $delegation->id);
            return $membership;
        });
    }

    public function revoke(User $actor, int $caseId, User $target): void
    {
        $this->assertSandbox();
        if ($actor->id === $target->id) throw new AuthorizationException;
        DB::transaction(function () use ($actor, $caseId, $target): void {
            CaseFile::whereKey($caseId)->lockForUpdate()->firstOrFail();
            $delegation = $this->delegation($actor, $caseId);
            $membership = CaseMembership::query()->where('case_file_id', $caseId)->where('user_id', $target->id)->lockForUpdate()->firstOrFail();
            $this->assertWithinDelegation($membership, $delegation);
            if ($membership->revoked_at !== null) return;
            $before = $membership->getAttributes();
            $membership->forceFill(['revoked_at' => now(), 'revision' => $membership->revision + 1])->save();
            app(SecurityAuditLogger::class)->recordCaseAccess($actor, 'case.membership.revoked', $membership, $before, $delegation->id);
        });
    }

    private function assertWithinDelegation(CaseMembership $membership, CaseAccessDelegation $delegation): void
    {
        // A narrow editor must not overwrite/revoke a broader protected grant via replacement.
        $existing = array_keys(array_filter(['read' => $membership->can_read, 'write' => $membership->can_write,
            'confidential' => $membership->can_read_confidential]));
        if (array_diff($existing, $delegation->grantable_scopes)) throw new AuthorizationException;
    }
}
