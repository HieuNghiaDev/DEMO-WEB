<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interpreters', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 16);
            $table->foreignId('employee_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->string('display_name', 120)->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('registration_key', 36)->unique();
            $table->char('registration_hash', 64);
            $table->timestamps();
        });
        Schema::create('interpretation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained()->restrictOnDelete();
            $table->foreignId('interpreter_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('language', 80);
            $table->string('work_type', 32);
            $table->string('mode', 16);
            $table->text('content');
            // UTC without a connection-dependent timezone interpretation on MySQL/PostgreSQL.
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->string('location', 255)->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('pending');
            $table->string('cancellation_reason', 500)->nullable();
            $table->foreignId('created_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('request_key', 36);
            $table->char('creation_hash', 64);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
            $table->unique(['case_file_id', 'created_by_user_id', 'request_key'], 'interpretation_create_once');
            $table->index(['case_file_id', 'status', 'starts_at'], 'interpretation_case_schedule');
            $table->index(['interpreter_id', 'status', 'starts_at', 'ends_at'], 'interpretation_interpreter_schedule');
        });
        // Register capabilities only. Never grant them to an existing role/account.
        foreach (['view', 'create', 'update', 'assign', 'transition', 'cancel', 'view_costs'] as $action) {
            DB::table('permissions')->insertOrIgnore(['name' => 'interpretation.'.$action,
                'display_name' => '通訳管理 '.$action, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        throw new LogicException('Interpretation history requires a reviewed data-preserving rollback.');
    }
};
