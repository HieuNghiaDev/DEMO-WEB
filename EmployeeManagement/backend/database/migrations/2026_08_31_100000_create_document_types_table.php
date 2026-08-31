<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name_ja');
            $table->string('name_vi')->nullable();
            $table->text('description')->nullable();
            $table->string('document_group', 30)->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['document_group', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_types');
    }
};
