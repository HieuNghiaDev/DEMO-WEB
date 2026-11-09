<?php

use App\Services\CaseAccessService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        (new CaseAccessService)->assertSandbox();
        Schema::create('rehearsal_lawyer_verifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->foreignId('verifier_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('verifier_employee_id')->constrained('employees')->restrictOnDelete();
            $table->string('evidence_source', 40);
            $table->char('evidence_digest', 64);
            $table->timestamp('verified_at');
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
        Schema::create('rehearsal_document_review_grants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->foreignId('verification_id')->constrained('rehearsal_lawyer_verifications')->restrictOnDelete();
            $table->foreignId('case_file_id')->constrained()->restrictOnDelete();
            $table->foreignId('case_document_id')->constrained()->restrictOnDelete();
            $table->foreignId('case_task_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('kind', 20);
            $table->string('source', 20);
            $table->unsignedBigInteger('file_id');
            $table->unsignedInteger('version');
            $table->char('evidence_digest', 64);
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'case_document_id', 'kind']);
        });
    }

    public function down(): void
    {
        (new CaseAccessService)->assertSandbox();
        Schema::dropIfExists('rehearsal_document_review_grants');
        Schema::dropIfExists('rehearsal_lawyer_verifications');
    }
};
