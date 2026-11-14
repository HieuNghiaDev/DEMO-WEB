<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_releases', function (Blueprint $table) {
            $table->id();
            $table->string('version', 32)->unique();
            $table->unsignedInteger('major');
            $table->unsignedInteger('minor');
            $table->unsignedInteger('patch');
            $table->string('codename', 80)->nullable();
            $table->string('release_type', 20);
            $table->string('title', 160);
            $table->json('release_notes');
            $table->timestamp('released_at');
            $table->foreignId('released_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('environment', 80);
            $table->string('build_sha', 80)->nullable();
            $table->string('build_number', 80)->nullable();
            $table->date('build_date')->nullable();
            $table->string('status', 20)->default('released');
            $table->timestamps();

            $table->index(['status', 'released_at']);
            $table->unique(['major', 'minor', 'patch']);
        });
    }

    public function down(): void
    {
        throw new LogicException('No automatic staging rollback.');
    }
};
