<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

/** C001.3C additive review proposal. No discovered migration or real operational apply authorization. */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') \App\Services\Administration\LocalAdministrationSandbox::requireMemoryDatabase();
        elseif (app()->bound(\App\Services\C001EngineValidationScope::class)) app(\App\Services\C001EngineValidationScope::class)->assertAllowed();
        else throw new LogicException('Independent issuer schema apply is isolated-validation only.');
        if (! Schema::hasColumn('legal_delegations', 'issuer_verification_id') || Schema::hasTable('legal_delegation_issuers')) {
            throw new LogicException('Explicit baseline required; no blind rerun/repair.');
        }
        Schema::create('legal_delegation_issuers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->foreignId('admitted_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('admitted_by_employee_id')->constrained('employees')->restrictOnDelete();
            $table->foreignId('case_file_id')->constrained()->restrictOnDelete();
            $table->string('scope', 32);
            $table->string('source', 80);
            $table->string('evidence_reference', 160);
            $table->char('evidence_digest', 64);
            $table->dateTime('issued_at');
            $table->dateTime('expires_at');
            $table->dateTime('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'employee_id', 'case_file_id', 'scope', 'revoked_at', 'expires_at'], 'c001_issuer_scope_validity');
        });
        Schema::table('legal_delegations', function (Blueprint $table): void {
            // Retain historical evidence; no fabricated admission or backfill for legacy delegations.
            $table->unsignedBigInteger('issuer_verification_id')->nullable()->change();
            $table->foreignId('issuer_admission_id')->nullable()->constrained('legal_delegation_issuers', indexName: 'c001_delegation_issuer_admission_fk')->restrictOnDelete();
        });
        $fields = ['id', 'user_id', 'employee_id', 'admitted_by_user_id', 'admitted_by_employee_id', 'case_file_id',
            'scope', 'source', 'evidence_reference', 'evidence_digest', 'issued_at', 'expires_at', 'created_at'];
        if (DB::getDriverName() === 'sqlite') {
            $changed = implode(' OR ', array_map(fn ($field) => "NEW.$field IS NOT OLD.$field", $fields));
            DB::unprepared("CREATE TRIGGER c001_issuer_facts_immutable BEFORE UPDATE ON legal_delegation_issuers WHEN ($changed) OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at) BEGIN SELECT RAISE(ABORT, 'Immutable issuer admission evidence'); END");
            DB::unprepared("CREATE TRIGGER c001_issuer_retained BEFORE DELETE ON legal_delegation_issuers BEGIN SELECT RAISE(ABORT, 'Retained issuer admission'); END");
            DB::unprepared("CREATE TRIGGER c001_delegation_requires_admission BEFORE INSERT ON legal_delegations WHEN NEW.issuer_admission_id IS NULL BEGIN SELECT RAISE(ABORT, 'Issuer admission required for new delegations'); END");
        } else {
            $changed = implode(' OR ', array_map(fn ($field) => "NOT(NEW.$field <=> OLD.$field)", $fields));
            DB::unprepared("CREATE TRIGGER c001_issuer_facts_immutable BEFORE UPDATE ON legal_delegation_issuers FOR EACH ROW BEGIN IF ($changed) OR (OLD.revoked_at IS NOT NULL AND NOT(NEW.revoked_at <=> OLD.revoked_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Immutable issuer admission evidence'; END IF; END");
            DB::unprepared("CREATE TRIGGER c001_issuer_retained BEFORE DELETE ON legal_delegation_issuers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retained issuer admission'");
            DB::unprepared("CREATE TRIGGER c001_delegation_requires_admission BEFORE INSERT ON legal_delegations FOR EACH ROW BEGIN IF NEW.issuer_admission_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Issuer admission required for new delegations'; END IF; END");
        }
    }

    public function down(): void { throw new LogicException('Issuer/delegation evidence is retained; no automatic rollback/drop.'); }
};
