<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_tasks', function (Blueprint $table) {
            $table->foreignId('case_document_id')->nullable()->after('case_file_id')
                ->constrained('case_documents')->nullOnDelete();
            $table->foreignId('created_by_employee_id')->nullable()->after('assigned_employee_id')
                ->constrained('employees')->nullOnDelete();
            $table->index(['case_file_id', 'case_document_id', 'status'], 'case_tasks_requirement_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('case_tasks', function (Blueprint $table) {
            $table->dropIndex('case_tasks_requirement_status_index');
            $table->dropConstrainedForeignId('created_by_employee_id');
            $table->dropConstrainedForeignId('case_document_id');
        });
    }
};
