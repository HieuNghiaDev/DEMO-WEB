<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_type_document_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_type_id')->constrained('case_types')->restrictOnDelete();
            $table->foreignId('document_type_id')->constrained('document_types')->restrictOnDelete();
            $table->string('purpose_category', 80)->nullable();
            // A candidate rule is not a legal necessity decision for an individual case.
            $table->string('requirement_level', 30)->default('conditional');
            $table->text('applicability_condition')->nullable();
            $table->text('standard_source')->nullable();
            $table->text('standard_target_person')->nullable();
            $table->text('standard_period_rule')->nullable();
            $table->foreignId('prerequisite_document_type_id')->nullable()
                ->constrained('document_types')->nullOnDelete();
            $table->string('priority_default', 20)->default('normal');
            $table->boolean('preservation_priority')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            // Multiple purposes/conditions may use the same document type.
            $table->index(['case_type_id', 'is_active', 'sort_order'], 'ctdr_case_active_order_idx');
            $table->index(['document_type_id', 'version'], 'ctdr_document_version_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_type_document_rules');
    }
};
