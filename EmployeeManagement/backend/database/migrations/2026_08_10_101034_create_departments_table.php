<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('office_id')
                ->constrained('offices')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            // Ví dụ: GENERAL, IT, LEGAL
            $table->string('department_code', 50);

            // Tên phòng ban
            $table->string('name');

            $table->string('status', 20)
                ->default('active')
                ->index();

            $table->timestamps();

            // Mỗi văn phòng không được trùng mã phòng ban
            $table->unique([
                'office_id',
                'department_code',
            ]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('departments');
    }
};