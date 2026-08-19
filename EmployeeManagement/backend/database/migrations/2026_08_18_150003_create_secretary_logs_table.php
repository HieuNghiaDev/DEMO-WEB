<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('secretary_logs', function (Blueprint $table) {
            $table->id();
            $table->string('skill_name')->nullable();
            $table->string('trigger_type');
            $table->json('input')->nullable();
            $table->json('output')->nullable();
            $table->string('status');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('secretary_logs');
    }
};
