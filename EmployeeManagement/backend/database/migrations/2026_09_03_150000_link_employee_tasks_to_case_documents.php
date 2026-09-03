<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_tasks', function (Blueprint $table) {
            $table->foreignId('case_document_id')
                ->nullable()
                ->after('employee_id')
                ->constrained('case_documents')
                ->nullOnDelete();

            $table->index(['case_document_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('employee_tasks', function (Blueprint $table) {
            $table->dropIndex(['case_document_id', 'status']);
            $table->dropConstrainedForeignId('case_document_id');
        });
    }
};
