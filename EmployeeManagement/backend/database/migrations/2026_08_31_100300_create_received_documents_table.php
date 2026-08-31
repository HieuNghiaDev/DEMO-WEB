<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('received_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnDelete();
            $table->foreignId('document_type_id')->nullable()->constrained('document_types')->nullOnDelete();
            $table->string('title');
            $table->string('original_filename')->nullable();
            $table->string('storage_type', 30);
            $table->string('storage_path', 2048)->nullable();
            $table->string('external_url', 2048)->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('received_at')->nullable();
            $table->date('expires_at')->nullable()->index();
            $table->string('original_or_copy', 30)->nullable();
            $table->boolean('return_required')->default(false);
            $table->timestamp('returned_at')->nullable();
            $table->foreignId('registered_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['case_file_id', 'received_at'], 'rd_case_received_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('received_documents');
    }
};
