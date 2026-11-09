<?php

namespace Tests\Feature;

use Tests\Support\SecurityRemediationTestCase;

/** Deferred acceptance gate: B1 is explicitly not authorized to cut over legacy admin. */
class LegacyAdminAuthoritySecurityTest extends SecurityRemediationTestCase
{
    public function test_legacy_admin_must_not_restore_permission_missing_from_pivots(): void
    {
        $user = $this->actor('deferred-legacy-admin', 'level_1');
        $user->update(['role' => 'admin']);
        $this->assertFalse($user->roles()->whereHas('permissions', fn ($query) => $query->where('name', 'employee.disable'))->exists());
        $this->assertFalse($user->hasPermission('employee.disable'), 'Open P3-03: cutover requires an approved mapping and a verified replacement admin.');
    }
}
