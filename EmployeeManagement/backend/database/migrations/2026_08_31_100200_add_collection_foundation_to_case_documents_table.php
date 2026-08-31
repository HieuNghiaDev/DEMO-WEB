<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_documents', function (Blueprint $table) {
            $table->foreignId('document_type_id')->nullable()->constrained('document_types')->nullOnDelete();
            $table->foreignId('case_type_document_rule_id')->nullable()
                ->constrained('case_type_document_rules')->nullOnDelete();
            $table->string('target_person')->nullable();
            $table->string('collection_source')->nullable();
            $table->date('target_period_from')->nullable();
            $table->date('target_period_to')->nullable();
            $table->text('target_scope')->nullable();
            // Intentionally independent of the legacy status/requirement_level columns.
            $table->string('necessity_status', 30)->default('undetermined');
            $table->text('necessity_reason')->nullable();
            $table->foreignId('necessity_decided_by_employee_id')->nullable()
                ->constrained('employees')->nullOnDelete();
            $table->timestamp('necessity_decided_at')->nullable();
            $table->string('collection_status', 30)->default('not_started');
            $table->string('fulfillment_status', 30)->default('undetermined');
            $table->string('review_status', 30)->default('unreviewed');
            $table->foreignId('assigned_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();
            $table->dateTime('response_deadline')->nullable()->index();
            $table->string('collection_priority', 20)->default('normal');
            $table->text('preservation_reason')->nullable();
            $table->index(['case_file_id', 'necessity_status'], 'cd_case_necessity_idx');
            $table->index(['case_file_id', 'collection_status'], 'cd_case_collection_idx');
            $table->index(['case_file_id', 'fulfillment_status'], 'cd_case_fulfillment_idx');
            $table->index(['case_file_id', 'review_status'], 'cd_case_review_idx');
        });
    }

    public function down(): void
    {
        // Rollback removes only Phase 1A additions, never legacy columns or rows.
        Schema::table('case_documents', function (Blueprint $table) {
            $table->dropIndex('cd_case_necessity_idx');
            $table->dropIndex('cd_case_collection_idx');
            $table->dropIndex('cd_case_fulfillment_idx');
            $table->dropIndex('cd_case_review_idx');
            $table->dropConstrainedForeignId('document_type_id');
            $table->dropConstrainedForeignId('case_type_document_rule_id');
            $table->dropConstrainedForeignId('necessity_decided_by_employee_id');
            $table->dropConstrainedForeignId('assigned_employee_id');
            $table->dropColumn([
                'target_person', 'collection_source', 'target_period_from', 'target_period_to',
                'target_scope', 'necessity_status', 'necessity_reason', 'necessity_decided_at',
                'collection_status', 'fulfillment_status', 'review_status', 'requested_at',
                'response_deadline', 'collection_priority', 'preservation_reason',
            ]);
        });
    }
};
