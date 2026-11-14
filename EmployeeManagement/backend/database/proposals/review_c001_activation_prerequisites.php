<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// REVIEW ONLY, outside discovery: explicit DATETIME avoids MariaDB legacy zero/auto-update TIMESTAMP defaults.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Preserve existing identities. New Eloquent accounts use secure model defaults.
            $table->boolean('activation_required')->default(false);
            $table->timestamp('activated_at')->nullable();
            $table->boolean('pii_requires_explicit')->default(false);
        });
        Schema::create('account_action_tokens', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('purpose', 32);
            $table->char('token_hash', 64)->unique();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->char('subject_email_hash', 64);
            $table->char('subject_identity_hash', 64);
            $table->dateTime('issued_at');
            $table->dateTime('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'purpose']);
        });
    }

    public function down(): void
    {
        throw new LogicException('Account evidence schema requires separately approved rollback.');
    }
};
