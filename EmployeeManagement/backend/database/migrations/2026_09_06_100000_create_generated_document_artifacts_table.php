<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generated_document_artifacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_generated_document_id')->constrained()->restrictOnDelete();
            $table->string('artifact_type', 30)->default('pdf');
            $table->string('storage_provider', 30);
            $table->string('external_file_id');
            $table->text('external_url');
            $table->string('filename');
            $table->string('mime_type', 100)->default('application/pdf');
            $table->string('checksum', 64)->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('uploaded_at');
            $table->timestamps();
            $table->unique(['case_generated_document_id', 'artifact_type', 'storage_provider'], 'generated_artifact_provider_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generated_document_artifacts');
    }
};
