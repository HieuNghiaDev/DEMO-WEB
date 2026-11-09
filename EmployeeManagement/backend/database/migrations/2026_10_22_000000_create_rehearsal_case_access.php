<?php

use App\Services\CaseAccessService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// B3.1 proposed schema: deliberately NOT runnable on MySQL before rollout approval.
return new class extends Migration
{
    public function up(): void
    {
        new CaseAccessService; // Also validates the resolved connection metadata before any Schema SQL.
        Schema::table('case_files', function (Blueprint $table): void {
            $table->boolean('is_confidential')->default(false);
        });
        Schema::create('case_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('case_file_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->boolean('can_read')->default(false);
            $table->boolean('can_write')->default(false);
            $table->boolean('can_read_confidential')->default(false);
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['case_file_id', 'user_id']);
            $table->index(['user_id', 'revoked_at', 'expires_at']);
        });
        Schema::create('case_access_delegations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('case_file_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->json('grantable_scopes');
            $table->string('approval_ref', 80);
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->unique(['case_file_id', 'user_id']);
        });
    }

    public function down(): void
    {
        new CaseAccessService;
        Schema::dropIfExists('case_access_delegations');
        Schema::dropIfExists('case_memberships');
        Schema::table('case_files', fn (Blueprint $table) => $table->dropColumn('is_confidential'));
    }
};
