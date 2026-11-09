<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Distinct messages must never be silently collapsed by the retry index.
        if (DB::table('chat_messages')->select('user_id', 'client_message_id')->groupBy('user_id', 'client_message_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Cross-room retry-key collision requires reviewed reconciliation.');
        }
        DB::transaction(function (): void {
            $roomId = DB::table('chat_rooms')->orderBy('id')->value('id');
            if ($roomId === null) {
                return;
            }
            DB::table('chat_messages')->update(['chat_room_id' => $roomId]);
            foreach (DB::table('chat_read_states')->orderBy('id')->get()->groupBy('user_id') as $states) {
                $keep = $states->first();
                DB::table('chat_read_states')->whereIn('id', $states->skip(1)->pluck('id'))->delete();
                // A single cursor cannot encode the old per-office visibility.
                // Reset conservatively so no newly shared message is skipped.
                DB::table('chat_read_states')->where('id', $keep->id)->update([
                    'chat_room_id' => $roomId, 'last_read_message_id' => null, 'read_at' => null,
                ]);
            }
            DB::table('chat_rooms')->where('id', '!=', $roomId)->delete();
        });
        Schema::table('chat_rooms', function (Blueprint $table): void {
            $table->unsignedTinyInteger('singleton_slot')->default(1)->unique();
        });
        if (DB::table('chat_rooms')->exists()) {
            DB::table('chat_rooms')->update(['kind' => 'general', 'name' => 'THEMIS_GENERAL']);
        }
        // UNIQUE plus a fixed-slot constraint allows exactly one kind of room.
        // SQLite does not support ALTER TABLE ADD CONSTRAINT; equivalent triggers
        // enforce the same insert/update invariant in isolated regression tests.
        if (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::unprepared("CREATE TRIGGER chat_singleton_".strtolower($event)." BEFORE $event ON chat_rooms WHEN NEW.singleton_slot != 1 OR NEW.kind != 'general' OR NEW.name != 'THEMIS_GENERAL' BEGIN SELECT RAISE(ABORT, 'Only THEMIS_GENERAL is allowed'); END");
            }
        } else {
            DB::statement("ALTER TABLE chat_rooms ADD CONSTRAINT chat_singleton_fixed CHECK (singleton_slot = 1 AND kind = 'general' AND name = 'THEMIS_GENERAL')");
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Shared chat history must not be automatically split or dropped. Roll forward.');
    }
};
