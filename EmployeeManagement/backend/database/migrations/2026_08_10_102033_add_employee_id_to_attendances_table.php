<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->foreignId('employee_id')
                ->nullable()
                ->after('id')
                ->constrained('employees')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->index([
                'employee_id',
                'work_date',
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropIndex([
                'employee_id',
                'work_date',
            ]);

            $table->dropConstrainedForeignId('employee_id');
        });
    }
};