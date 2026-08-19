<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('matter_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->enum('horizon', ['short', 'mid', 'long']);
            $table->dateTime('due_date')->nullable();
            $table->string('status');
            $table->enum('source', ['ai_generated', 'manual']);
            $table->string('assigned_to')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
