<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', fn (Blueprint $table) => $table->json('attachments')->nullable());
    }

    public function down(): void
    {
        Schema::table('chat_messages', fn (Blueprint $table) => $table->dropColumn('attachments'));
    }
};
