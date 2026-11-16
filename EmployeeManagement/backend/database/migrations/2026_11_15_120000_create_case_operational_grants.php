<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('case_operational_grants', function (Blueprint $table) {
            $table->foreignId('case_file_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->boolean('create_tasks');
            $table->boolean('review_tasks');
            $table->boolean('edit_overview');
            $table->unique(['case_file_id', 'user_id'], 'case_operational_grants_case_user');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_operational_grants');
    }
};
