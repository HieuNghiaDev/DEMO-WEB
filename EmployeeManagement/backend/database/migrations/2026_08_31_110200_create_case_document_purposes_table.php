<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_document_purposes', function (Blueprint $table) {
            $table->foreignId('case_document_id')->constrained('case_documents')->cascadeOnDelete();
            $table->foreignId('document_purpose_id')->constrained('document_purposes')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['case_document_id', 'document_purpose_id'], 'cdp_link_unique');
            $table->index('document_purpose_id', 'cdp_purpose_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_document_purposes');
    }
};
