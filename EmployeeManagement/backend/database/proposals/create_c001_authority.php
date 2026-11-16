<?php

use App\Services\CaseAccessService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// NOT auto-discovered by migrate. Proposed schema, executable ONLY in isolated RAM tests.
// An operational migration requires separate review/approval; do not remove this guard and run it.
return new class extends Migration
{
    public function up(): void
    {
        (new CaseAccessService)->assertSandbox();
        Schema::create('lawyer_verifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->foreignId('verifier_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('verifier_employee_id')->constrained('employees')->restrictOnDelete();
            $table->foreignId('supersedes_id')->nullable()->unique()->constrained('lawyer_verifications')->restrictOnDelete();
            $table->string('source', 80);
            $table->string('evidence_reference', 160);
            $table->char('evidence_digest', 64);
            $table->timestamp('issued_at');
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'employee_id']);
        });
        Schema::create('legal_delegations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->foreignId('issuer_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('issuer_employee_id')->constrained('employees')->restrictOnDelete();
            $table->foreignId('verification_id')->constrained('lawyer_verifications')->restrictOnDelete();
            $table->foreignId('issuer_verification_id')->constrained('lawyer_verifications')->restrictOnDelete();
            $table->foreignId('case_file_id')->constrained()->restrictOnDelete();
            $table->foreignId('case_document_id')->constrained()->restrictOnDelete();
            $table->foreignId('case_generated_document_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->string('scope', 20);
            $table->string('evidence_reference', 160);
            $table->char('evidence_digest', 64);
            $table->timestamp('issued_at');
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'case_generated_document_id', 'version']);
        });
        (require __DIR__.'/upgrade_c001_independent_issuers.php')->up();
    }

    public function down(): void
    {
        (new CaseAccessService)->assertSandbox();
        Schema::dropIfExists('legal_delegations');
        Schema::dropIfExists('lawyer_verifications');
    }
};
