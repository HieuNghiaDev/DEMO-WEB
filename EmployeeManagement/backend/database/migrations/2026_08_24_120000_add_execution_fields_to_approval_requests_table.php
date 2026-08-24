<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_requests', function (Blueprint $table) {
            $table->foreignId('executed_by')
                ->nullable()
                ->after('rejected_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('executed_at')->nullable()->after('executed_by');
        });
    }

    public function down(): void
    {
        Schema::table('approval_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('executed_by');
            $table->dropColumn('executed_at');
        });
    }
};
