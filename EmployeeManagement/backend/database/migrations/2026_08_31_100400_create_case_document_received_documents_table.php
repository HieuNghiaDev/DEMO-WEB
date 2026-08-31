<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_document_received_documents', function (Blueprint $table) {
            $table->foreignId('case_document_id')->constrained('case_documents')->cascadeOnDelete();
            $table->foreignId('received_document_id')->constrained('received_documents')->cascadeOnDelete();
            $table->string('relationship_type', 50)->nullable();
            $table->timestamps();
            $table->unique(['case_document_id', 'received_document_id'], 'cdrd_link_unique');
            $table->index('received_document_id', 'cdrd_received_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_document_received_documents');
    }
};
