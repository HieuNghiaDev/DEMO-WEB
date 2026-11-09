<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_message_views', function (Blueprint $table): void {
            $table->foreignId('chat_message_id')->constrained('chat_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->primary(['chat_message_id', 'user_id']);
        });
    }

    public function down(): void
    {
        throw new LogicException('Chat read history requires a reviewed, data-preserving rollback.');
    }
};
