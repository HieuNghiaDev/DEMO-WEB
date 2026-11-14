<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Operational migration FOR REVIEW, outside automatic discovery. No real apply is authorized by C001.2.
return new class extends Migration
{
    public function up(): void
    {
        // REVIEW ONLY: outside migration discovery; operational apply requires separate owner approval.
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
            $table->dateTime('issued_at');
            $table->dateTime('expires_at');
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
            $table->dateTime('issued_at');
            $table->dateTime('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'case_generated_document_id', 'version'], 'c001_delegation_exact_version_index');
        });
    }

    public function down(): void
    {
        throw new LogicException('Legal authority evidence cannot be dropped by automatic rollback.');
    }
};

