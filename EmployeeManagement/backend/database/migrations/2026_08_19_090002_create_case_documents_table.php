<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnUpdate()->cascadeOnDelete();
            $table->string('category', 50);
            $table->string('title');
            $table->string('file_url')->nullable();
            $table->string('version', 20)->default('1');
            $table->string('status', 20)->default('draft')->index();
            $table->foreignId('created_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('created_by_ai_name')->nullable();
            $table->foreignId('confirmed_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_documents');
    }
};
