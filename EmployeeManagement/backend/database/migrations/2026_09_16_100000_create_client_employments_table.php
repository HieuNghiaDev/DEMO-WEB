<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_employments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->string('company_name');
            $table->string('company_address');
            $table->string('company_phone', 30)->nullable();
            $table->string('employment_status', 30)->default('employed')->index();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->boolean('is_current')->default(true)->index();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['client_id', 'is_current']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_employments');
    }
};
