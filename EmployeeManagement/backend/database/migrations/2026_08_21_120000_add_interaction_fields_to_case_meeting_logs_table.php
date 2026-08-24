<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_meeting_logs', function (Blueprint $table) {
            $table->string('interaction_type', 30)->default('meeting')->after('meeting_date')->index();
            $table->dateTime('next_action_due_at')->nullable()->after('next_action');
        });
    }

    public function down(): void
    {
        Schema::table('case_meeting_logs', function (Blueprint $table) {
            $table->dropColumn(['interaction_type', 'next_action_due_at']);
        });
    }
};
