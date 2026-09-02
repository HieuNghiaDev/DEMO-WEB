<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_code_sequences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->constrained('offices')->cascadeOnUpdate()->restrictOnDelete();
            $table->unsignedSmallInteger('sequence_year');
            $table->unsignedSmallInteger('last_sequence')->default(0);
            $table->timestamps();

            $table->unique(['office_id', 'sequence_year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_code_sequences');
    }
};
