<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Empty synthetic schema counterpart of RuntimeCaseAccessSchema; its source/local-only guards are unchanged.
return new class extends Migration {
    public function up(): void
    {
        Schema::table('case_files', fn (Blueprint $t) => $t->boolean('is_confidential')->nullable());
        Schema::create('case_memberships', function (Blueprint $t): void {
            $t->id();
            $t->foreignId('case_file_id')->constrained()->restrictOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->foreignId('employee_id')->constrained()->restrictOnDelete();
            foreach (['can_read', 'can_write', 'can_read_confidential'] as $name) $t->boolean($name)->default(false);
            $t->foreignId('granted_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->string('evidence_ref', 80);
            $t->timestamp('expires_at')->nullable(); $t->timestamp('revoked_at')->nullable();
            $t->unsignedInteger('revision')->default(1); $t->timestamps();
            $t->unique(['case_file_id', 'user_id']); $t->index(['user_id', 'revoked_at', 'expires_at']);
        });
    }
    public function down(): void { throw new LogicException('No automatic staging rollback.'); }
};
