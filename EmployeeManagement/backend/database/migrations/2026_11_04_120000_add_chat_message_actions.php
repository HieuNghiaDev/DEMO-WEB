<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->foreignId('reply_to_message_id')->nullable()->constrained('chat_messages')->restrictOnDelete();
            $table->timestamp('recalled_at')->nullable();
            $table->timestamp('pinned_at')->nullable();
            $table->unsignedBigInteger('pinned_by')->nullable();
            $table->index(['chat_room_id', 'pinned_at'], 'chat_messages_room_pinned');
        });

        Schema::create('chat_message_actions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('chat_room_id')->constrained('chat_rooms')->restrictOnDelete();
            $table->foreignId('chat_message_id')->constrained('chat_messages')->restrictOnDelete();
            $table->unsignedBigInteger('actor_user_id');
            $table->string('action', 10);
            $table->timestamp('created_at');
            $table->index(['chat_room_id', 'id']);
        });

        DB::table('permissions')->insertOrIgnore([
            'name' => 'chat.pin', 'display_name' => '社内チャットのピン留め',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        throw new LogicException('Chat actions require a reviewed, data-preserving rollback.');
    }
};
