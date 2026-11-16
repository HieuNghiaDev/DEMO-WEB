<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Additive operational schema for REVIEW ONLY; outside Laravel migration discovery. No grants/backfill. */
return new class extends Migration
{
    public function up(): void
    {
        // Validate dependencies before DDL. The existing B24 schema must be reviewed/provisioned separately.
        // C001.4 explicit-legal authority needs evidence/MFA, not dormant enterprise admission tables.
        foreach (['authentication_challenges', 'case_generated_documents'] as $table) {
            if (! Schema::hasTable($table)) throw new LogicException('C001 schema prerequisite missing: '.$table);
        }
        Schema::create('c001_version_provenance', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('case_generated_document_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('sequence');
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->unsignedBigInteger('actor_employee_id')->nullable();
            $table->string('event', 32);
            $table->char('content_hash', 64);
            $table->char('previous_hash', 64)->nullable();
            $table->char('entry_hash', 64);
            $table->boolean('trusted');
            $table->dateTime('occurred_at');
            $table->unique(['case_generated_document_id', 'sequence'], 'c001_provenance_sequence_unique');
        });
        Schema::create('c001_legal_proofs', function (Blueprint $table): void {
            $table->id();
            // Challenges/tokens may be deleted at logout; retain their numeric reference without blocking revocation.
            $table->unsignedBigInteger('challenge_id')->unique();
            $table->string('request_key', 80)->index();
            $table->char('context_hash', 64);
            $table->json('context');
            $table->dateTime('issued_at');
            $table->dateTime('expires_at');
        });
        Schema::create('c001_legal_decisions', function (Blueprint $table): void {
            $table->id();
            $table->string('request_key', 80)->unique();
            $table->string('decision_type', 32);
            // Stable numeric identities are retained even if operational accounts are later removed.
            $table->unsignedBigInteger('actor_user_id');
            $table->unsignedBigInteger('actor_employee_id');
            $table->unsignedBigInteger('case_file_id');
            $table->unsignedBigInteger('case_document_id');
            $table->foreignId('case_generated_document_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->foreignId('proof_id')->unique()->constrained('c001_legal_proofs')->restrictOnDelete();
            $table->char('context_hash', 64);
            $table->json('context');
            $table->dateTime('decided_at');
        });
        foreach (['c001_version_provenance', 'c001_legal_proofs', 'c001_legal_decisions'] as $table) {
            foreach (['UPDATE', 'DELETE'] as $operation) {
                $trigger = $table.'_'.strtolower($operation).'_denied';
                if (DB::getDriverName() === 'sqlite') {
                    DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} BEGIN SELECT RAISE(ABORT, 'Immutable C001 evidence'); END");
                } elseif (DB::getDriverName() === 'mysql') {
                    DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable C001 evidence'");
                } else throw new LogicException('Unsupported C001 evidence database.');
            }
        }
        foreach (['case_generated_documents' => 'OLD.id', 'generated_document_artifacts' => 'OLD.case_generated_document_id',
            'case_task_submissions' => 'OLD.case_generated_document_id'] as $table => $reference) {
            foreach (['UPDATE', 'DELETE'] as $operation) {
                $trigger = 'c001_frozen_'.$table.'_'.strtolower($operation);
                $condition = "EXISTS (SELECT 1 FROM c001_legal_decisions WHERE case_generated_document_id = {$reference})";
                if (DB::getDriverName() === 'sqlite') {
                    DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} WHEN {$condition} BEGIN SELECT RAISE(ABORT, 'Immutable approved C001 content'); END");
                } else {
                    DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} FOR EACH ROW BEGIN IF {$condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable approved C001 content'; END IF; END");
                }
            }
        }
        foreach (['generated_document_artifacts', 'case_task_submissions'] as $table) {
            foreach (['INSERT', 'UPDATE'] as $operation) {
                $trigger = 'c001_frozen_new_'.$table.'_'.strtolower($operation);
                $condition = 'EXISTS (SELECT 1 FROM c001_legal_decisions WHERE case_generated_document_id = NEW.case_generated_document_id)';
                if (DB::getDriverName() === 'sqlite') {
                    DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} WHEN {$condition} BEGIN SELECT RAISE(ABORT, 'Immutable approved C001 references'); END");
                } else {
                    DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} FOR EACH ROW BEGIN IF {$condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable approved C001 references'; END IF; END");
                }
            }
        }
    }

    public function down(): void
    {
        throw new LogicException('Legal evidence is retained. An independently approved restoration plan is required.');
    }
};
