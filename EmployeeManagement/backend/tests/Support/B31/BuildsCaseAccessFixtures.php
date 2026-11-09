<?php

namespace Tests\Support\B31;

use App\Models\CaseAccessDelegation;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseMembership;
use App\Models\User;
use App\Services\CaseAccessService;
use Tests\Support\B21\AdminAContract;

/** Synthetic entitlement arrange ONLY; not an owner registry or production backfill. */
trait BuildsCaseAccessFixtures
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->app->instance(CaseAccessService::class, new CaseAccessService);
    }

    protected function reader(string $label = 'reader', array $extra = []): User
    {
        return $this->fixtureUser('b31-'.$label, ['case.view', ...$extra]);
    }

    protected function member(User $user, CaseFile $case, array $scopes = ['read']): CaseMembership
    {
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        return CaseMembership::forceCreate(['case_file_id' => $case->id, 'user_id' => $user->id,
            'employee_id' => $user->employee_id, 'can_read' => in_array('read', $scopes, true),
            'can_write' => in_array('write', $scopes, true), 'can_read_confidential' => in_array('confidential', $scopes, true),
            'expires_at' => now()->addHour(), 'revision' => 1]);
    }

    protected function manager(CaseFile $case, array $grantable = ['read', 'write', 'confidential'], bool $canonical = false): User
    {
        $manager = $this->fixtureUser('b31-delegated-admin', ['case.manage_access',
            ...($canonical ? AdminAContract::adminFixturePermissions() : [])], $canonical ? 'admin' : null);
        CaseAccessDelegation::forceCreate(['case_file_id' => $case->id, 'user_id' => $manager->id,
            'employee_id' => $manager->employee_id, 'grantable_scopes' => $grantable,
            'approval_ref' => 'synthetic-owner-b31', 'expires_at' => now()->addDay()]);
        return $manager;
    }

    protected function document(CaseFile $case): CaseDocument
    {
        return $case->documents()->create(['title' => 'Synthetic confidential document', 'category' => 'required',
            'necessity_status' => 'required', 'status' => 'not_requested']);
    }
}
