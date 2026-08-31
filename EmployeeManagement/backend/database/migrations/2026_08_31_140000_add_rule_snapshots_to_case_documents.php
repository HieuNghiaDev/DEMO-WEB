<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_documents', function (Blueprint $table) {
            // Historical case context, not live projections of the referenced master rule.
            $table->unsignedInteger('rule_version_snapshot')->nullable();
            $table->text('applicability_condition_snapshot')->nullable();
            // Same provenance marker/length as case_type_document_rules.master_source.
            $table->string('rule_source_snapshot', 100)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('case_documents', function (Blueprint $table) {
            $table->dropColumn(['rule_version_snapshot', 'applicability_condition_snapshot', 'rule_source_snapshot']);
        });
    }
};
