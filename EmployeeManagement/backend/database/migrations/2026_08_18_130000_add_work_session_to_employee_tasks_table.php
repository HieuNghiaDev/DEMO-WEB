<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_tasks', function (Blueprint $table) {
            $table->foreignId('work_session_id')
                ->nullable()
                ->unique()
                ->after('employee_id')
                ->constrained('work_sessions')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employee_tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('work_session_id');
        });
    }
};
