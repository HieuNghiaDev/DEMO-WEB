<?php

namespace Tests\Feature\B21;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\Support\B21\AdminAContract;
use Tests\Support\B21\B21TestCase;

/** Schema/route prerequisites fail RED, never skip; complete HTTP assertions run once implemented. */
class ActivationAcceptanceTest extends B21TestCase
{
    public function test_pending_account_cannot_login_even_if_its_password_is_known(): void
    {
        [$user] = $this->pendingInvite('pending-login');
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertStatus(422)->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_valid_invite_sets_password_and_allows_a_real_clean_login(): void
    {
        [$user, $token, $id] = $this->pendingInvite('valid-invite');
        $this->assertSame(hash('sha256', $token), DB::table('account_action_tokens')->where('id', $id)->value('token_hash'));
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))
            ->assertOk()->assertJsonMissingPath('token');
        $this->assertNotNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
        $this->assertFalse((bool) $user->fresh()->activation_required);
        $this->assertNotNull($user->fresh()->activated_at);
        $this->assertTrue(Hash::check(self::SYNTHETIC_PASSWORD.'-Owner', $user->fresh()->password));
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD.'-Owner'])
            ->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonStructure(['token']);
        Mail::assertNothingSent();
    }

    public function test_invalid_token_does_not_change_the_pending_account(): void
    {
        [$user] = $this->pendingInvite('wrong-token');
        $before = $user->fresh()->getAttributes();
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload(str_repeat('0', 64)))->assertStatus(422);
        $this->assertSame($before, $user->fresh()->getAttributes());
    }

    public function test_expired_token_is_rejected_without_consumption(): void
    {
        [$user, $token, $id] = $this->pendingInvite('expired-token');
        $before = $user->fresh()->password;
        $this->travel(AdminAContract::ACTIVATION_TTL_HOURS + 1)->hours();
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertStatus(422);
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
        $this->assertSame($before, $user->fresh()->password);
    }

    public function test_used_token_cannot_be_replayed(): void
    {
        [$user, $token] = $this->pendingInvite('replay-token');
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertOk();
        $before = $user->fresh()->password;
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertStatus(422);
        $this->assertSame($before, $user->fresh()->password);
    }

    public function test_revoked_token_is_rejected(): void
    {
        [, $token, $id] = $this->pendingInvite('revoked-token');
        DB::table('account_action_tokens')->where('id', $id)->update(['revoked_at' => now()]);
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertStatus(422);
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
    }

    public function test_activation_token_is_bound_to_its_purpose_and_identity(): void
    {
        [$user, $token, $id] = $this->pendingInvite('wrong-purpose');
        DB::table('account_action_tokens')->where('id', $id)->update(['purpose' => 'password_reset']);
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertStatus(422);
        DB::table('account_action_tokens')->where('id', $id)->update(['purpose' => 'activation']);
        $user->update(['email' => 'changed-synthetic@example.test']);
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertStatus(422);
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
    }

    public function test_invite_never_reactivates_a_disabled_account(): void
    {
        [$user, $token] = $this->pendingInvite('disabled-token');
        $user->update(['is_active' => false]);
        $before = $user->fresh()->password;
        $this->postJson('/'.AdminAContract::ACTIVATION_ROUTE, $this->activationPayload($token))->assertStatus(422);
        $this->assertFalse($user->fresh()->is_active);
        $this->assertSame($before, $user->fresh()->password);
    }

    public function test_existing_active_employee_can_still_login_without_password_reset(): void
    {
        $user = $this->fixtureEmployee('existing-login');
        $before = $user->fresh()->password;
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertOk()->assertJsonPath('user.id', $user->id);
        $this->assertSame($before, $user->fresh()->password);
    }
}
