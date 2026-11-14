<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Schema\Blueprint;

/** REVIEW ONLY, outside discovery. No real migration is authorized by C001.2. */
return new class extends Migration
{
    public function up(): void
    {
        // Do not invent an Admin installation or repair lifecycle data during MFA schema apply.
        foreach (['users', 'personal_access_tokens', 'security_administration_state'] as $table) {
            if (! Schema::hasTable($table)) throw new LogicException('Review prerequisite missing: '.$table);
        }
        if (! Schema::hasColumns('users', ['activation_required', 'activated_at', 'must_change_password'])) {
            throw new LogicException('Approved account lifecycle schema is required before MFA provisioning.');
        }
        if (Schema::hasTable('account_mfa') || Schema::hasTable('authentication_challenges')) {
            throw new LogicException('Existing MFA schema requires an explicit inventory, not a blind rerun.');
        }
        // B24 field/constraint contract, ported for explicit MariaDB expiry semantics; no real apply authorized.
        Schema::table('security_administration_state', function (Blueprint $table): void {
            $table->string('installation_id', 64)->nullable();
            // Retain the reservation even if an operator removes the pending identity.
            $table->unsignedBigInteger('bootstrap_user_id')->nullable();
            $table->timestamp('bootstrap_completed_at')->nullable();
        });
        DB::table('security_administration_state')->where('id', 1)->update(['installation_id' => bin2hex(random_bytes(32))]);
        Schema::create('account_mfa', function (Blueprint $table): void {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->text('secret_ciphertext')->nullable();
            $table->text('pending_ciphertext')->nullable();
            $table->unsignedBigInteger('pending_challenge_id')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->unsignedInteger('version')->default(0);
            $table->bigInteger('last_step')->default(-1);
            $table->timestamp('last_login_at')->nullable();
            $table->char('login_identity_hash', 64)->nullable();
            $table->timestamp('recovery_issued_at')->nullable();
        });
        Schema::create('authentication_challenges', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('token_id')->nullable()->constrained('personal_access_tokens')->cascadeOnDelete();
            $table->string('purpose', 32);
            $table->char('secret_hash', 64)->unique();
            $table->char('identity_hash', 64);
            $table->unsignedInteger('mfa_version')->default(0);
            $table->string('action', 64)->nullable();
            $table->char('scope_hash', 64)->nullable();
            $table->boolean('remember')->default(false);
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->dateTime('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'purpose']);
        });
        Schema::create('mfa_recovery_codes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('code_hash', 64)->unique();
            $table->timestamp('used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->dateTime('created_at');
        });
        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->unsignedInteger('mfa_version')->nullable();
            $table->timestamp('mfa_verified_at')->nullable();
            $table->char('mfa_identity_hash', 64)->nullable();
        });
    }

    public function down(): void
    {
        throw new LogicException('Do not remove authentication/evidence schema through automatic rollback.');
    }
};

