<?php

namespace App\Services\Administration;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use App\Services\EmployeeCodeGenerator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use SensitiveParameter;

final class FirstAdminBootstrap
{
    public function __construct(private readonly AdminContinuityGuard $guard, private readonly EmployeeCodeGenerator $codes) {}

    /** Apply is permanently denied outside this approved synthetic sandbox; dry-run CLI does not query DB. */
    public function prepare(): ActivationInvitation
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        return $this->guard->run(function (): ActivationInvitation {
            $state = $this->state();
            if ($state->bootstrap_user_id) {
                $user = User::find($state->bootstrap_user_id);
                if (! $user || ! $user->activation_required || ! $user->is_active || ! $user->employee || $user->employee->status !== 'active') {
                    $this->invalid();
                }
            }
            DB::table('authentication_challenges')->where('purpose', 'bootstrap_setup')->whereNull('used_at')->update(['revoked_at' => now()]);
            $raw = bin2hex(random_bytes(32));
            $expires = now()->addMinutes(15);
            DB::table('authentication_challenges')->insert([
                'user_id' => $state->bootstrap_user_id, 'purpose' => 'bootstrap_setup', 'secret_hash' => hash('sha256', $raw),
                'identity_hash' => $this->installationHash($state), 'expires_at' => $expires, 'created_at' => now(), 'updated_at' => now(),
            ]);
            return new ActivationInvitation($raw, $expires);
        }, new User, 'administration.bootstrap_setup_prepared', null, true);
    }

    /** Returns one activation invitation, not an Admin credential or privileged bearer. */
    public function provision(#[SensitiveParameter] string $setup, array $identity = []): array
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        $reserved = DB::table('security_administration_state')->where('id', 1)->value('bootstrap_user_id');
        $target = $reserved ? User::find($reserved) : new User;
        if (! $target) {
            $this->invalid();
        }
        return $this->guard->run(function () use ($setup, $identity, $target): array {
            $state = $this->state();
            $challenge = DB::table('authentication_challenges')->where('secret_hash', hash('sha256', $setup))
                ->where('purpose', 'bootstrap_setup')->lockForUpdate()->first();
            if (! $challenge || $challenge->used_at || $challenge->revoked_at || Carbon::parse($challenge->expires_at)->lte(now())
                || ! hash_equals($challenge->identity_hash, $this->installationHash($state))) {
                $this->invalid();
            }
            if ($state->bootstrap_user_id) {
                if ($identity !== [] || $target->id !== (int) $state->bootstrap_user_id || ! $target->activation_required
                    || ! $target->is_active || ! $target->employee || $target->employee->status !== 'active') {
                    $this->invalid();
                }
            } else {
                $data = Validator::make($identity, [
                    'full_name' => ['required', 'string', 'max:255'], 'full_name_kana' => ['nullable', 'string', 'max:255'],
                    'office_id' => ['required', 'integer', 'exists:offices,id'], 'hire_date' => ['required', 'date'],
                    'work_email' => ['required', 'email', 'max:255', 'unique:users,email', 'unique:employees,work_email'],
                    'department_id' => ['nullable', 'integer', 'exists:departments,id'],
                ])->validate();
                $office = Office::findOrFail($data['office_id']);
                if (isset($data['department_id']) && ! $office->departments()->whereKey($data['department_id'])->exists()) {
                    throw ValidationException::withMessages(['department_id' => 'Department must belong to the selected office.']);
                }
                $employee = Employee::create([...$data, 'work_email' => strtolower($data['work_email']),
                    'employee_code' => $this->codes->allocate($office), 'status' => 'active', 'employment_type' => 'full_time']);
                $target->fill(['employee_id' => $employee->id, 'name' => $employee->full_name,
                    'login_id' => $employee->employee_code, 'email' => $employee->work_email, 'is_active' => true])->save();
                DB::table('security_administration_state')->where('id', 1)->update(['bootstrap_user_id' => $target->id]);
            }
            if (DB::table('authentication_challenges')->where('id', $challenge->id)->whereNull('used_at')->whereNull('revoked_at')
                ->update(['used_at' => now(), 'user_id' => $target->id]) !== 1) {
                $this->invalid();
            }
            DB::table('account_action_tokens')->where('user_id', $target->id)->where('purpose', 'activation')
                ->whereNull('used_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $raw = bin2hex(random_bytes(32));
            $expires = now()->addHours(24);
            DB::table('account_action_tokens')->insert([
                'user_id' => $target->id, 'purpose' => 'activation', 'token_hash' => hash('sha256', $raw), 'issued_by' => null,
                'subject_email_hash' => hash('sha256', $target->email), 'subject_identity_hash' => AccountActivationService::identityHash($target),
                'issued_at' => now(), 'expires_at' => $expires, 'created_at' => now(), 'updated_at' => now(),
            ]);
            return ['user_id' => $target->id, 'invitation' => new ActivationInvitation($raw, $expires)];
        }, $target, 'administration.bootstrap_identity_provisioned', null, true);
    }

    public function finish(#[SensitiveParameter] string $session): void
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        $token = PersonalAccessToken::findToken($session);
        $userId = DB::table('security_administration_state')->where('id', 1)->value('bootstrap_user_id');
        $user = $userId ? User::find($userId) : null;
        if (! $user || ! $token || (int) $token->tokenable_id !== $user->id) {
            $this->invalid();
        }
        $this->guard->completeFirstBootstrap($user, $token->id);
    }

    private function state(): object
    {
        $state = DB::table('security_administration_state')->where('id', 1)->lockForUpdate()->first();
        if (! $state || ! $state->installation_id || $state->admin_seen || $state->bootstrap_completed_at
            || User::whereHas('roles', fn ($q) => $q->where('name', 'admin'))->exists()) {
            $this->invalid();
        }
        return $state;
    }

    private function installationHash(object $state): string
    {
        return hash('sha256', $state->installation_id.'|'.($state->bootstrap_user_id ?? 'new'));
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['bootstrap' => 'Bootstrap is unavailable; verify installation and approved operator process.']);
    }
}
