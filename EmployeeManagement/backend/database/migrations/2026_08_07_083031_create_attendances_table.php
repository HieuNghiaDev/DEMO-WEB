<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();

            // Họ và tên nhân viên
            $table->string('employee_name');

            // Ngày làm việc
            $table->date('work_date');

            // Giờ bắt đầu làm việc
            $table->dateTime('clock_in');

            // Giờ bắt đầu nghỉ trưa
            $table->dateTime('break_start')->nullable();

            // Giờ kết thúc nghỉ trưa
            $table->dateTime('break_end')->nullable();

            // Giờ kết thúc làm việc
            $table->dateTime('clock_out')->nullable();

            // working, break hoặc offline
            $table->string('status', 20)->default('working');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};