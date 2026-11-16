<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->string('type', 20);
            $table->dateTime('started_at');
            $table->dateTime('expected_end_at')->nullable();
            $table->dateTime('ended_at')->nullable();
            $table->string('destination', 255)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['attendance_id', 'type', 'started_at']);
            $table->index(['attendance_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        throw new LogicException('No automatic staging rollback.');
    }
};
