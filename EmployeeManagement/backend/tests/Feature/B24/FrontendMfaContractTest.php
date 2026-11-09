<?php

namespace Tests\Feature\B24;

use App\Services\Administration\AdminCapabilities;
use Tests\Support\B21\B21TestCase;

class FrontendMfaContractTest extends B21TestCase
{
    public function test_employee_session_metadata_does_not_force_mfa_or_grant_roles(): void
    {
        $employee = $this->fixtureEmployee('frontend-session');
        $before = $employee->permission_names;
        $response = $this->postJson('/api/login', ['email' => $employee->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertOk()->assertJsonPath('authentication.requires_mfa', false);
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $this->withToken($response->json('token'))->getJson('/api/me')->assertOk()->assertJsonPath('authentication.requires_mfa', false);
        $this->assertSame($before, $employee->fresh()->permission_names);
    }

    public function test_mfa_only_session_and_refresh_expose_server_required_hint_without_new_authority(): void
    {
        $admin = $this->fixtureUser('frontend-admin', AdminCapabilities::ESSENTIAL, 'admin');
        $challenge = $this->postJson('/api/login', ['email' => $admin->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertStatus(202)->assertJsonPath('mfa_required', true)->assertJsonMissingPath('token')->assertJsonMissingPath('user');
        $this->assertStringContainsString('no-store', $challenge->headers->get('Cache-Control'));
        $secret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge->json('challenge')])
            ->assertOk()->json('secret');
        $totp = app(\App\Services\Administration\Totp::class);
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge->json('challenge'),
            'otp' => $totp->code($secret, now()->timestamp)])
            ->assertOk()->assertJsonCount(10, 'recovery_codes')->assertJsonMissingPath('token');
        $next = $this->postJson('/api/login', ['email' => $admin->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertStatus(202)->assertJsonPath('purpose', 'login_mfa');
        $this->travel(31)->seconds();
        $session = $this->postJson('/api/mfa/login', ['challenge' => $next->json('challenge'),
            'otp' => $totp->code($secret, now()->timestamp)])
            ->assertOk()->assertJsonPath('authentication.requires_mfa', true);
        $this->assertStringContainsString('no-store', $session->headers->get('Cache-Control'));
        $token = $session->json('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('authentication.requires_mfa', true);
        $this->assertFalse($admin->hasPermission('case.view'));
        $this->assertFalse($admin->hasPermission('employee.view_private'));
        $this->assertFalse($admin->hasPermission('document.approve_legal'));
    }

    public function test_pending_account_still_cannot_get_password_or_mfa_business_session(): void
    {
        $employee = $this->fixtureEmployee('frontend-pending');
        $employee->forceFill(['activation_required' => true, 'activated_at' => null])->save();
        $this->postJson('/api/login', ['email' => $employee->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertUnprocessable()->assertJsonMissingPath('token')->assertJsonMissingPath('challenge');
    }
}
