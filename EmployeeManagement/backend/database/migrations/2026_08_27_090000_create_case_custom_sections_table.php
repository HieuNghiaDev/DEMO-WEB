<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_custom_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnUpdate()->cascadeOnDelete();
            $table->foreignId('created_by_employee_id')->nullable()->constrained('employees')->cascadeOnUpdate()->nullOnDelete();
            $table->string('title', 80);
            $table->text('content')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['case_file_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_custom_sections');
    }
};
