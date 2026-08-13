<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('event', 100)->index();
            $table->string('outcome', 20)->index();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained()
                ->nullOnDelete();
            $table->foreignId('employee_id')
                ->nullable()
                ->constrained()
                ->nullOnDelete();
            $table->char('identifier_hash', 64)->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->string('request_method', 10)->nullable();
            $table->string('request_path', 255)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_audit_logs');
    }
};
