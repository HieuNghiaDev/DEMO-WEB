<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The local MySQL schema no longer contains this deprecated table, while
        // its original migration record remains for historical continuity.
        // Skip it only when bootstrapping the PostgreSQL development replica.
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            return;
        }

        Schema::create('matters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->string('status');
            $table->string('category')->nullable();
            $table->string('assigned_to')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matters');
    }
};
