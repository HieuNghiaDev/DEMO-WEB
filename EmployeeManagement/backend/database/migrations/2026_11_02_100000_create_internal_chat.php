<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_rooms', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('office_id')->constrained('offices')->restrictOnDelete();
            $table->string('kind', 30)->default('general');
            $table->string('name', 100);
            $table->timestamps();
            $table->unique(['office_id', 'kind']);
        });

        Schema::create('chat_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('chat_room_id')->constrained('chat_rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->restrictOnDelete();
            $table->uuid('client_message_id');
            $table->text('original_text');
            $table->string('source_language', 10);
            $table->text('japanese_content')->nullable();
            $table->text('vietnamese_content')->nullable();
            $table->string('translation_status', 20)->default('pending')->index();
            $table->string('translation_error_category', 50)->nullable();
            $table->string('translation_provider', 50)->default('pending');
            $table->json('translation_provider_metadata')->nullable();
            $table->timestamps();
            $table->unique(['chat_room_id', 'user_id', 'client_message_id'], 'chat_message_retry_unique');
            $table->index(['chat_room_id', 'id']);
        });

        Schema::create('chat_read_states', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('chat_room_id')->constrained('chat_rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('last_read_message_id')->nullable()->constrained('chat_messages')->nullOnDelete();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->unique(['chat_room_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_read_states');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_rooms');
    }
};
