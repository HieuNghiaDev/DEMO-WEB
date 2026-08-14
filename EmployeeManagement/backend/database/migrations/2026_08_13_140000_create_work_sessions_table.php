<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->string('task_description', 255);
            $table->dateTime('started_at');
            $table->dateTime('expected_end_at');
            $table->dateTime('ended_at')->nullable();
            $table->string('status', 20)->default('active');
            $table->timestamps();

            $table->index(['attendance_id', 'status']);
            $table->index('expected_end_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_sessions');
    }
};
