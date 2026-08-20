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

        // Preserve existing production data while moving to the normalized model.
        DB::table('attendances')
            ->orderBy('id')
            ->chunkById(200, function ($attendances): void {
                foreach ($attendances as $attendance) {
                    if ($attendance->break_start !== null) {
                        DB::table('attendance_periods')->insert([
                            'attendance_id' => $attendance->id,
                            'type' => 'break',
                            'started_at' => $attendance->break_start,
                            'ended_at' => $attendance->break_end,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }

                    if ($attendance->outside_start !== null) {
                        DB::table('attendance_periods')->insert([
                            'attendance_id' => $attendance->id,
                            'type' => 'outside',
                            'started_at' => $attendance->outside_start,
                            'expected_end_at' => $attendance->outside_expected_end,
                            'ended_at' => $attendance->outside_end,
                            'destination' => $attendance->outside_destination,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_periods');
    }
};
