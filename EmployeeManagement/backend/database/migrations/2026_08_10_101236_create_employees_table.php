<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();

            // Mã nhân viên: EMP0001
            $table->string('employee_code', 50)->unique();

            // Họ và tên
            $table->string('full_name');

            // Phiên âm Katakana
            $table->string('full_name_kana')->nullable();

            // male, female, other
            $table->string('gender', 20)->nullable();

            // Mã quốc gia: VN, JP
            $table->char('nationality_code', 2)->nullable();

            $table->date('date_of_birth')->nullable();
            $table->date('hire_date');
            $table->date('termination_date')->nullable();

            // Văn phòng
            $table->foreignId('office_id')
                ->constrained('offices')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            // Phòng ban
            $table->foreignId('department_id')
                ->nullable()
                ->constrained('departments')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            // Chức vụ
            $table->string('position_title')->nullable();

            // full_time, part_time, contract, intern
            $table->string('employment_type', 30)
                ->default('full_time');

            $table->string('work_email')
                ->nullable()
                ->unique();

            $table->string('phone', 30)->nullable();

            // /images/boy.png hoặc /images/girl.png
            $table->string('avatar_path')->nullable();

            // active, on_leave, resigned
            $table->string('status', 20)
                ->default('active')
                ->index();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};