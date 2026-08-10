<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offices', function (Blueprint $table) {
            $table->id();

            // THEMIS, CHUKA_LAW...
            $table->string('office_code', 50)->unique();

            // Tên văn phòng
            $table->string('name');

            // Địa chỉ
            $table->string('address')->nullable();

            // Đường dẫn ảnh văn phòng
            $table->string('room_image')->nullable();

            // active hoặc inactive
            $table->string('status', 20)
                ->default('active')
                ->index();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offices');
    }
};