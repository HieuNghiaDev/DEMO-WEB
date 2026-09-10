<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_generation_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_type_id')->constrained('document_types')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->string('renderer_type', 80);
            $table->string('format', 20)->default('html');
            $table->longText('template_body');
            $table->json('field_schema');
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['document_type_id', 'version'], 'document_generation_template_version_unique');
        });

        Schema::create('case_generated_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_document_id')->constrained('case_documents')->cascadeOnDelete();
            $table->foreignId('document_generation_template_id')->constrained('document_generation_templates')->restrictOnDelete();
            $table->string('workflow_status', 30)->default('draft')->index();
            $table->json('draft_data');
            $table->json('approved_data')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique('case_document_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_generated_documents');
        Schema::dropIfExists('document_generation_templates');
    }
};
