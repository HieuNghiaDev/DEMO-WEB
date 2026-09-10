<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_types', function (Blueprint $table) {
            $table->string('handling_type', 30)->nullable()->after('document_group')->index();
        });

        Schema::create('document_source_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_type_id')->constrained('document_types')->restrictOnDelete();
            $table->unsignedInteger('source_version');
            $table->string('source_kind', 30)->default('original');
            $table->string('original_filename');
            $table->string('mime_type', 150);
            $table->string('storage_provider', 30);
            $table->string('external_file_id')->nullable();
            $table->text('external_url')->nullable();
            $table->string('local_reference')->nullable();
            $table->string('checksum', 64)->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->date('effective_from')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(
                ['document_type_id', 'source_version', 'source_kind'],
                'document_source_identity_unique'
            );
            $table->index(['storage_provider', 'external_file_id'], 'document_source_external_index');
        });

        // Existing generation templates provide deterministic evidence that these
        // document types are office-generated. Leave every other type unclassified.
        DB::table('document_types')
            ->whereIn('id', DB::table('document_generation_templates')->select('document_type_id'))
            ->whereNull('handling_type')
            ->update(['handling_type' => 'office_generated']);
    }

    public function down(): void
    {
        Schema::dropIfExists('document_source_files');
        Schema::table('document_types', function (Blueprint $table) {
            $table->dropColumn('handling_type');
        });
    }
};
