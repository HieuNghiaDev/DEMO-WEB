<?php

namespace App\Services\Administration;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use LogicException;

/** Synthetic evidence registry, NOT a production owner/signature verifier or grant writer.
 * Only the existing organization-wide projection is supported. Narrow HR ACLs remain blocked.
 */
final class RehearsalHrApprovals
{
    public const SCOPE = ['scope' => 'organization', 'fields' => ['date_of_birth', 'nationality_code', 'phone']];

    private array $approvals = [];

    public function __construct()
    {
        self::assertSandbox();
    }

    public static function assertSandbox(): void
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        if (PHP_SAPI !== 'cli' || ! defined('PHPUNIT_COMPOSER_INSTALL') || ! app()->runningUnitTests()) {
            throw new LogicException('HR mapping rehearsal is PHPUnit RAM only.');
        }
    }

    /** Non-credential digest; revision invalidates even revoke/regrant between reads. */
    public static function grantHash(User $user): string
    {
        self::assertSandbox();
        self::assertIdentity($user);
        $roles = $user->roles()->with('permissions:id,name')->orderBy('id')->get()->map(fn ($role) => [
            'id' => $role->id, 'name' => $role->name,
            'permissions' => $role->permissions->sortBy('id')->map(fn ($p) => [$p->id, $p->name])->values()->all(),
        ])->all();
        return hash('sha256', json_encode([$user->id, $roles,
            DB::table('security_administration_state')->where('id', 1)->value('revision')], JSON_THROW_ON_ERROR));
    }

    public function approve(User $subject, User $approver, string $evidence, array $scope, int $expiresAt): void
    {
        self::assertSandbox();
        self::assertIdentity($subject);
        self::assertIdentity($approver);
        // These identities/evidence are explicitly synthetic fixture inputs, never owner approval.
        if ($subject->id === $approver->id || ! AdminCapabilities::active($subject) || ! AdminCapabilities::active($approver)
            || $scope !== self::SCOPE || preg_match('/^synthetic-evidence:[a-z0-9-]+$/D', $evidence) !== 1
            || $expiresAt <= now()->timestamp || $expiresAt > now()->addDay()->timestamp
            || ! $subject->roles()->whereHas('permissions', fn ($q) => $q->where('name', 'employee.view_private'))->exists()) {
            throw new LogicException('Independent explicit private-read evidence and supported complete scope are required.');
        }
        $this->approvals[$subject->id] = ['grant_hash' => self::grantHash($subject),
            'identity_hash' => VerifiedMfaSessions::identityHash($subject->fresh()),
            'approver_id' => $approver->id, 'approver_hash' => VerifiedMfaSessions::identityHash($approver->fresh()),
            'evidence_ref' => $evidence, 'expires_at' => $expiresAt];
    }

    public function revoke(User $subject): void
    {
        self::assertSandbox();
        unset($this->approvals[$subject->id]);
    }

    public function allows(User $subject): bool
    {
        self::assertSandbox();
        self::assertIdentity($subject);
        $approval = $this->approvals[$subject->id] ?? null;
        $approver = $approval ? User::find($approval['approver_id']) : null;
        if (! $approval || $approval['expires_at'] <= now()->timestamp || ! AdminCapabilities::active($subject)
            || ! $approver || ! AdminCapabilities::active($approver)
            || ! hash_equals($approval['approver_hash'], VerifiedMfaSessions::identityHash($approver))
            || ! hash_equals($approval['identity_hash'], VerifiedMfaSessions::identityHash($subject->fresh()))
            || ! hash_equals($approval['grant_hash'], self::grantHash($subject))) {
            unset($this->approvals[$subject->id]);
            return false;
        }
        return true;
    }

    private static function assertIdentity(User $user): void
    {
        if ($user->getConnection()->getName() !== config('database.default')) {
            throw new LogicException('Only the isolated primary connection is accepted.');
        }
    }
}
