<?php

namespace Tests\Feature\B27;

use App\Contracts\AdministrativeAuthentication;
use App\Models\Permission;
use App\Models\SecurityAuditLog;
use App\Services\Administration\AdministrativeRoleService;
use App\Services\Administration\Totp;
use Illuminate\Auth\Access\AuthorizationException;
use Tests\Support\B21\B21TestCase;

class AdminGrantBoundaryTest extends B21TestCase
{
    public function test_real_mfa_and_scoped_stepup_do_not_grant_protected_permissions_or_self_edit(): void
    {
        $admin = $this->fixtureAdmin('grant-boundary');
        $target = $this->fixtureEmployee('ordinary-grant-target');
        $credentials = ['email' => $admin->email, 'password' => self::SYNTHETIC_PASSWORD];
        $challenge = $this->postJson('/api/login', $credentials)->assertStatus(202)->json('challenge');
        $secret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertOk()->json('secret');
        $totp = app(Totp::class);
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge,
            'otp' => $totp->code($secret, now()->timestamp)])->assertOk();
        $challenge = $this->postJson('/api/login', $credentials)->assertStatus(202)->json('challenge');
        $this->travel(31)->seconds();
        $token = $this->postJson('/api/mfa/login', ['challenge' => $challenge,
            'otp' => $totp->code($secret, now()->timestamp)])->assertOk()->json('token');

        foreach (['employee.view_private', 'employee.verify_lawyer', 'document.approve_legal',
            'document.review_internal', 'employee.activation.manage', 'employee.manage_roles',
            'audit.view', 'settings.manage', 'developer.view', 'self'] as $name) {
            $role = $name === 'self' ? $admin->roles()->sole() : $target->roles()->sole();
            $names = $name === 'self' ? ['employee.view'] : ['employee.view', $name];
            if ($name !== 'self') Permission::firstOrCreate(['name' => $name], ['display_name' => 'Synthetic protected']);
            $scope = ['role_id' => $role->id, 'permissions' => $names];
            $this->travel(31)->seconds();
            $this->app['auth']->forgetGuards();
            $this->withToken($token)->postJson('/api/mfa/step-up', [...$credentials,
                'otp' => $totp->code($secret, now()->timestamp), 'action' => 'role.permissions', 'scope' => $scope])->assertOk();
            $this->assertTrue(app(AdministrativeAuthentication::class)->permitsMutation($admin, 'role.permissions', $scope));
            $before = $role->permissions()->pluck('name')->all();
            $audits = SecurityAuditLog::count();
            try {
                app(AdministrativeRoleService::class)->replacePermissions($admin, $role, $names);
                $this->fail('Step-up must not bypass grantability or self-role protection: '.$name);
            } catch (AuthorizationException) {
                $this->assertSame($before, $role->permissions()->pluck('name')->all());
                $this->assertSame($audits, SecurityAuditLog::count());
                $this->assertTrue(app(AdministrativeAuthentication::class)->permitsMutation($admin, 'role.permissions', $scope));
            }
        }
    }
}
