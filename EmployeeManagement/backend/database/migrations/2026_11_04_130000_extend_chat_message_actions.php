<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->unsignedBigInteger('recalled_by')->nullable();
            $table->unsignedBigInteger('translation_attempt')->default(0);
        });

        Schema::create('chat_message_user_states', function (Blueprint $table): void {
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('chat_message_id')->constrained('chat_messages')->restrictOnDelete();
            $table->timestamp('hidden_at');
            $table->boolean('read_before_hide')->default(false);
            $table->primary(['user_id', 'chat_message_id']);
        });
    }

    public function down(): void
    {
        throw new LogicException('Chat message history requires a reviewed, data-preserving rollback.');
    }
};
