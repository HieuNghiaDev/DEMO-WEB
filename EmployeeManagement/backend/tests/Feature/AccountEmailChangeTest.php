<?php

namespace Tests\Feature;

use App\Mail\EmailChangeCode;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Administration\AccountEmailChange;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Support\B21\B21TestCase;

class AccountEmailChangeTest extends B21TestCase
{
    private User $actor;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actor = $this->fixtureUser('email-change', []);
        $this->token = $this->actor->createToken('synthetic-email-session')->plainTextToken;
        $this->withToken($this->token);
    }

    private function issue(string $email = 'new-synthetic@example.test', array $extra = [])
    {
        return $this->postJson('/api/me/email-change', [
            'email' => $email, 'current_password' => self::SYNTHETIC_PASSWORD, ...$extra,
        ]);
    }

    private function code(): string
    {
        $mail = Mail::sent(EmailChangeCode::class)->last();
        $code = $mail->content()->with['code'];
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/D', $code);
        return $code;
    }

    private function confirm(string $id, string $code)
    {
        return $this->postJson('/api/me/email-change/confirm', ['challenge_id' => $id, 'code' => $code]);
    }

    public function test_verified_change_updates_only_after_correct_code_and_revokes_old_sessions(): void
    {
        $old = $this->actor->email;
        $this->actor->employee->update(['work_email' => $old]);
        $result = $this->issue()->assertOk()->assertJsonPath('expires_in', 600)->assertJsonMissingPath('code');
        $id = $result->json('challenge_id');
        $code = $this->code();
        $pending = DB::table('email_change_requests')->where('id', $id)->first();
        $this->assertSame($old, $this->actor->fresh()->email);
        $this->assertNotSame($code, $pending->code_hash);
        $this->assertNotSame('new-synthetic@example.test', $pending->email_ciphertext);
        $this->assertSame('new-synthetic@example.test', Crypt::decryptString($pending->email_ciphertext));
        Mail::assertSent(EmailChangeCode::class, fn ($mail) => $mail->hasTo('new-synthetic@example.test'));
        $this->confirm($id, $code)->assertOk()->assertJsonPath('reauthentication_required', true);
        $this->assertSame('new-synthetic@example.test', $this->actor->fresh()->email);
        $this->assertSame('new-synthetic@example.test', $this->actor->employee->fresh()->work_email);
        $this->assertNotNull($this->actor->fresh()->email_verified_at);
        $this->assertSame(0, $this->actor->tokens()->count());
        $this->assertDatabaseHas('security_audit_logs', ['event' => 'administration.account_email_changed', 'outcome' => 'success']);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_invalid_or_expired_codes_cannot_change_email(): void
    {
        $old = $this->actor->email;
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        $wrong = $code === '000000' ? '000001' : '000000';
        $this->confirm($id, $wrong)->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertDatabaseHas('email_change_requests', ['id' => $id, 'attempts' => 1, 'used_at' => null]);
        $this->travel(11)->minutes();
        $this->confirm($id, $code)->assertUnprocessable();
        $this->assertSame($old, $this->actor->fresh()->email);
        $this->assertDatabaseMissing('security_audit_logs', ['event' => 'administration.account_email_changed']);
    }

    public function test_five_wrong_codes_revoke_request_and_a_correct_code_cannot_replay(): void
    {
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        $wrong = $code === '000000' ? '000001' : '000000';
        for ($attempt = 0; $attempt < 5; $attempt++) $this->confirm($id, $wrong)->assertUnprocessable();
        $this->travel(61)->seconds();
        $this->confirm($id, $code)->assertUnprocessable();
        $this->assertNotNull(DB::table('email_change_requests')->where('id', $id)->value('revoked_at'));
        $this->assertSame($this->actor->email, $this->actor->fresh()->email);
    }

    public function test_resend_revokes_old_code_and_waits_for_cooldown(): void
    {
        $first = $this->issue()->assertOk()->json('challenge_id');
        $firstCode = $this->code();
        $this->issue()->assertTooManyRequests();
        $this->travel(61)->seconds();
        $second = $this->issue()->assertOk()->json('challenge_id');
        $secondCode = $this->code();
        $this->assertNotSame($first, $second);
        $this->confirm($first, $firstCode)->assertUnprocessable();
        $this->confirm($second, $secondCode)->assertOk();
        Mail::assertSent(EmailChangeCode::class, 2);
    }

    public function test_other_accounts_and_other_sessions_cannot_consume_a_code(): void
    {
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        $other = $this->fixtureUser('email-other', []);
        $this->app['auth']->forgetGuards();
        $this->withToken($other->createToken('other')->plainTextToken);
        $this->confirm($id, $code)->assertUnprocessable();
        $this->app['auth']->forgetGuards();
        $this->withToken($this->actor->createToken('second-same-user')->plainTextToken);
        $this->confirm($id, $code)->assertUnprocessable();
        $this->assertSame($this->actor->email, $this->actor->fresh()->email);
    }

    public function test_password_duplicate_email_and_identity_spoofing_are_rejected(): void
    {
        $this->issue('new-synthetic@example.test', ['current_password' => 'wrong'])->assertUnprocessable();
        $this->travel(61)->seconds();
        $other = $this->fixtureUser('email-duplicate', []);
        $this->issue($other->email)->assertUnprocessable();
        $this->travel(61)->seconds();
        $this->issue('new-synthetic@example.test', ['user_id' => $other->id])->assertUnprocessable();
        $this->assertDatabaseCount('email_change_requests', 0);
        Mail::assertNothingSent();
    }

    public function test_guest_inactive_and_missing_employee_cannot_issue(): void
    {
        $this->withoutToken();
        $this->getJson('/api/me/email-change')->assertUnauthorized();
        $this->issue()->assertUnauthorized();
        $this->withToken($this->token);
        $this->actor->update(['is_active' => false]);
        $this->app['auth']->forgetGuards();
        $this->issue()->assertUnauthorized();
        $this->assertDatabaseCount('email_change_requests', 0);
    }

    public function test_mail_failure_rolls_back_pending_request_and_never_changes_email(): void
    {
        $mailer = \Mockery::mock(\Illuminate\Contracts\Mail\Mailer::class);
        $mailer->shouldReceive('to')->andReturnSelf();
        $mailer->shouldReceive('send')->andThrow(new \RuntimeException('synthetic SMTP credential detail'));
        Mail::shouldReceive('mailer')->andReturn($mailer);
        $this->issue()->assertStatus(503)->assertDontSee('credential detail');
        $this->assertDatabaseCount('email_change_requests', 0);
        $this->assertSame($this->actor->email, $this->actor->fresh()->email);
    }

    public function test_required_audit_failure_rolls_back_email_and_code_consumption(): void
    {
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        SecurityAuditLog::creating(function ($log): void {
            if ($log->event === 'administration.account_email_changed') abort(503);
        });
        $this->confirm($id, $code)->assertStatus(503);
        $this->assertSame($this->actor->email, $this->actor->fresh()->email);
        $this->assertDatabaseHas('email_change_requests', ['id' => $id, 'used_at' => null]);
        $this->assertSame(1, $this->actor->tokens()->count());
    }

    public function test_log_delivery_is_local_only_and_does_not_enable_production_mail(): void
    {
        config(['mail.default' => 'log']);
        app()->detectEnvironment(fn () => 'production');
        $this->assertFalse(app(AccountEmailChange::class)->available());
        app()->detectEnvironment(fn () => 'local');
        $this->assertTrue(app(AccountEmailChange::class)->available());
        $this->assertTrue(app(AccountEmailChange::class)->usesLocalLog());
    }

    public function test_used_code_cannot_change_email_again_even_with_a_new_session(): void
    {
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        $this->confirm($id, $code)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($this->actor->fresh()->createToken('fresh-synthetic-session')->plainTextToken);
        $this->confirm($id, $code)->assertUnprocessable();
        $this->assertSame(1, DB::table('security_audit_logs')->where('event', 'administration.account_email_changed')->count());
    }

    public function test_email_taken_after_issuance_prevents_confirmation(): void
    {
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        $other = $this->fixtureUser('email-later-taken', []);
        $other->update(['email' => 'new-synthetic@example.test']);
        $this->confirm($id, $code)->assertUnprocessable();
        $this->assertSame($this->actor->email, $this->actor->fresh()->email);
        $this->assertDatabaseHas('email_change_requests', ['id' => $id, 'used_at' => null]);
    }

    public function test_mfa_cannot_be_replaced_with_an_email_code_and_last_admin_protection_remains(): void
    {
        $admin = $this->fixtureAdmin('email-mfa');
        $token = $this->authenticatedFixtureToken($admin);
        $this->app['auth']->forgetGuards();
        $this->withToken($token);
        $this->getJson('/api/me/email-change')->assertOk()->assertJsonPath('requires_mfa', true);
        $this->issue()->assertUnprocessable();
        Mail::assertNothingSent();
        $this->travel(61)->seconds();
        $secret = Crypt::decryptString(DB::table('account_mfa')->where('user_id', $admin->id)->value('secret_ciphertext'));
        $otp = app(\App\Services\Administration\Totp::class)->code($secret, now()->timestamp);
        $id = $this->issue('mfa-email@example.test', ['otp' => $otp])->assertOk()->json('challenge_id');
        $this->assertDatabaseHas('authentication_challenges', ['user_id' => $admin->id, 'action' => AccountEmailChange::ACTION]);
        $this->confirm($id, $this->code())->assertUnprocessable()->assertJsonValidationErrors('admin');
        $this->assertSame($admin->email, $admin->fresh()->email);
        $this->assertDatabaseHas('email_change_requests', ['id' => $id, 'used_at' => null]);
    }

    public function test_changed_account_identity_invalidates_pending_email_code(): void
    {
        $id = $this->issue()->assertOk()->json('challenge_id');
        $code = $this->code();
        DB::table('users')->where('id', $this->actor->id)->update(['login_id' => 'changed-synthetic-id']);
        $this->confirm($id, $code)->assertUnprocessable();
        $this->assertSame($this->actor->email, $this->actor->fresh()->email);
    }

    public function test_mfa_user_with_verified_replacement_can_change_email_without_changing_mfa_secret(): void
    {
        $admin = $this->fixtureAdmin('email-primary-admin');
        $token = $this->authenticatedFixtureToken($admin);
        $replacement = $this->fixtureAdmin('email-replacement-admin');
        $this->authenticatedFixtureToken($replacement);
        $this->app['auth']->forgetGuards();
        $this->withToken($token);
        $state = DB::table('account_mfa')->where('user_id', $admin->id)->first();
        $secret = Crypt::decryptString($state->secret_ciphertext);
        $this->travel(61)->seconds();
        $otp = app(\App\Services\Administration\Totp::class)->code($secret, now()->timestamp);
        $id = $this->issue('verified-mfa-change@example.test', ['otp' => $otp])->assertOk()->json('challenge_id');
        $this->confirm($id, $this->code())->assertOk();
        $this->assertSame('verified-mfa-change@example.test', $admin->fresh()->email);
        $this->assertSame($state->secret_ciphertext, DB::table('account_mfa')->where('user_id', $admin->id)->value('secret_ciphertext'));
        $this->assertSame($replacement->email, $replacement->fresh()->email);
        $this->assertTrue(app(\App\Services\Administration\VerifiedMfaSessions::class)->ready($replacement));
    }
}
