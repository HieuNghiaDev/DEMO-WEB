<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_type_document_rule_purposes', function (Blueprint $table) {
            // Explicit short names stay within MySQL's 64-character identifier limit.
            $table->foreignId('case_type_document_rule_id')
                ->constrained('case_type_document_rules', 'id', 'ctdrp_rule_fk')->cascadeOnDelete();
            $table->foreignId('document_purpose_id')
                ->constrained('document_purposes', 'id', 'ctdrp_purpose_fk')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['case_type_document_rule_id', 'document_purpose_id'], 'ctdrp_link_unique');
            $table->index('document_purpose_id', 'ctdrp_purpose_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_type_document_rule_purposes');
    }
};
