<?php

namespace Tests\Feature;

use App\Contracts\ChatTranslationProvider;
use App\Jobs\TranslateChatMessage;
use App\Models\ChatMessage;
use App\Models\Office;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\Support\B21\B21TestCase;

class InternalChatApiTest extends B21TestCase
{
    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actor = $this->fixtureUser('chat-actor', []);
        $this->actingAs($this->actor);
    }

    private function send(string $text = '今日は会議があります。', ?string $key = null)
    {
        return $this->postJson('/api/internal-chat/messages', [
            'text' => $text,
            'client_message_id' => $key ?? (string) Str::uuid(),
        ]);
    }

    private function translate(int $id, string $pair = 'ja-vi')
    {
        return $this->postJson("/api/internal-chat/messages/$id/translations", ['pair' => $pair]);
    }

    public function test_guest_and_non_employee_are_denied(): void
    {
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/internal-chat/messages')->assertUnauthorized();

        $user = User::factory()->create(['employee_id' => null, 'is_active' => true, 'must_change_password' => false]);
        $this->actingAs($user);
        $this->getJson('/api/internal-chat/messages')->assertForbidden();
        $this->send()->assertForbidden();
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_attachments_are_private_idempotent_and_follow_message_access(): void
    {
        Storage::fake('local');
        $bytes = "%PDF-1.4\nsynthetic PDF\n%%EOF";
        $key = (string) Str::uuid();
        $send = fn (string $content) => $this->post('/api/internal-chat/messages', [
            'client_message_id' => $key,
            'attachments' => [UploadedFile::fake()->createWithContent('資料.pdf', $content)],
        ], ['Accept' => 'application/json']);

        $id = $send($bytes)->assertCreated()
            ->assertJsonPath('message.translation_status', 'completed')
            ->assertJsonPath('message.attachments.0.name', '資料.pdf')
            ->assertJsonMissingPath('message.attachments.0.path')
            ->assertJsonMissingPath('message.attachments.0.sha256')
            ->json('message.id');
        $send($bytes)->assertCreated()->assertJsonPath('message.id', $id);
        $send($bytes."\nchanged")->assertConflict();
        $this->assertCount(1, Storage::disk('local')->allFiles('internal-chat'));

        $download = "/api/internal-chat/messages/{$id}/attachments/1";
        $other = $this->fixtureUser('chat-attachment-recipient', []);
        $this->actingAs($other);
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonPath('messages.0.attachments.0.id', 1);
        $response = $this->get($download)->assertOk()->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertSame($bytes, $response->streamedContent());
        $this->getJson("/api/internal-chat/messages/{$id}/attachments/2")->assertNotFound();
        $this->patchJson("/api/internal-chat/messages/{$id}/hide")->assertOk();
        $this->getJson($download)->assertNotFound();

        $this->actingAs($this->actor);
        $this->get($download)->assertOk();
        $this->patchJson("/api/internal-chat/messages/{$id}/recall")->assertOk();
        $this->getJson($download)->assertNotFound();
        $this->getJson("/api/internal-chat/messages/{$id}")->assertOk()->assertJsonPath('message.attachments', []);
    }

    public function test_attachment_upload_rejects_disguised_files_and_rolls_back_failed_message_writes(): void
    {
        Storage::fake('local');
        $endpoint = '/api/internal-chat/messages';
        $headers = ['Accept' => 'application/json'];
        $this->post($endpoint, [
            'client_message_id' => (string) Str::uuid(),
            'attachments' => [UploadedFile::fake()->createWithContent('spoof.pdf', '<html>not a PDF</html>')],
        ], $headers)->assertUnprocessable()->assertJsonValidationErrors('attachments.0');

        ChatMessage::updating(function (ChatMessage $message): void {
            if ($message->isDirty('attachments')) abort(503);
        });
        $this->post($endpoint, [
            'client_message_id' => (string) Str::uuid(),
            'attachments' => [UploadedFile::fake()->createWithContent('synthetic.pdf', "%PDF-1.4\n%%EOF")],
        ], $headers)->assertStatus(503);
        $this->assertDatabaseCount('chat_messages', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('internal-chat'));
    }

    public function test_image_only_message_uploads_and_downloads_with_detected_image_type(): void
    {
        Storage::fake('local');
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
        $id = $this->post('/api/internal-chat/messages', [
            'client_message_id' => (string) Str::uuid(),
            'attachments' => [UploadedFile::fake()->createWithContent('synthetic.png', $png)],
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('message.original_text', '')
            ->assertJsonPath('message.attachments.0.mime_type', 'image/png')
            ->assertJsonPath('message.translation_status', 'completed')
            ->json('message.id');

        $response = $this->get("/api/internal-chat/messages/{$id}/attachments/1")
            ->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->assertSame($png, $response->streamedContent());
        $this->getJson('/api/internal-chat/messages')->assertOk()
            ->assertJsonPath('messages.0.attachments.0.name', 'synthetic.png');
    }

    public function test_sender_and_office_scope_cannot_be_forged(): void
    {
        $this->postJson('/api/internal-chat/messages', [
            'text' => '偽装を拒否', 'client_message_id' => (string) Str::uuid(),
            'sender_id' => 999, 'office_id' => 999, 'room_id' => 999, 'chat_room_id' => 999,
        ])->assertUnprocessable()->assertJsonValidationErrors(['sender_id', 'office_id', 'room_id', 'chat_room_id']);

        $this->send()->assertCreated()
            ->assertJsonPath('message.sender.id', $this->actor->employee_id)
            ->assertJsonPath('message.is_mine', true);
        $this->assertDatabaseHas('chat_messages', ['user_id' => $this->actor->id, 'employee_id' => $this->actor->employee_id]);
    }

    public function test_active_staff_in_different_offices_share_one_room_and_keep_independent_read_state(): void
    {
        $id = $this->send()->assertCreated()->json('message.id');
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonPath('messages.0.id', $id);

        $other = $this->fixtureUser('chat-other-office', []);
        $otherOffice = Office::create(['office_code' => 'CHAT-OTHER', 'name' => 'Synthetic other office', 'status' => 'active']);
        $other->employee->update(['office_id' => $otherOffice->id]);
        $this->actingAs($other->fresh());
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonCount(1, 'messages');
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 1);
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $id])->assertOk();
        $this->patchJson('/api/internal-chat/read', ['message_id' => $id])->assertOk()->assertJsonPath('unread_count', 0);
        $this->send('別の事務所')->assertCreated();
        $this->getJson('/api/internal-chat/messages')->assertJsonCount(2, 'messages');

        $this->actingAs($this->actor);
        $this->getJson('/api/internal-chat/messages')->assertJsonCount(2, 'messages')->assertJsonPath('messages.0.id', $id);
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 1);
        $this->assertDatabaseCount('chat_rooms', 1);
        $this->assertDatabaseHas('chat_rooms', ['singleton_slot' => 1, 'name' => 'THEMIS_GENERAL']);
    }

    public function test_retry_is_idempotent_and_conflicting_retry_is_rejected(): void
    {
        $key = (string) Str::uuid();
        $id = $this->send('同じメッセージ', $key)->assertCreated()->json('message.id');
        $this->send('同じメッセージ', $key)->assertCreated()->assertJsonPath('message.id', $id);
        $this->send('異なるメッセージ', $key)->assertConflict();
        $this->assertDatabaseCount('chat_messages', 1);
    }

    public function test_pagination_and_incremental_cursor_preserve_order(): void
    {
        foreach (range(1, 5) as $index) {
            $this->send('メッセージ'.$index)->assertCreated();
        }
        $latest = $this->getJson('/api/internal-chat/messages?limit=3')->assertOk()
            ->assertJsonCount(3, 'messages')->assertJsonPath('pagination.has_more', true);
        $ids = collect($latest->json('messages'))->pluck('id')->all();
        $this->assertSame([...$ids], collect($ids)->sort()->values()->all());
        $latest->assertJsonPath('pagination.latest_id', $ids[2]);

        $this->getJson('/api/internal-chat/messages?before_id='.$ids[0].'&limit=3')
            ->assertOk()->assertJsonCount(2, 'messages')->assertJsonPath('pagination.latest_id', $ids[2]);
        $this->getJson('/api/internal-chat/messages?after_id='.$ids[0].'&limit=1')
            ->assertOk()->assertJsonPath('messages.0.id', $ids[1])->assertJsonPath('pagination.latest_id', $ids[2]);
        $this->getJson('/api/internal-chat/messages?after_id='.($ids[2] + 100).'&limit=10')
            ->assertOk()->assertJsonCount(0, 'messages')->assertJsonPath('pagination.latest_id', $ids[2]);
    }

    public function test_default_history_is_twenty_and_older_pages_exhaust_without_overlapping(): void
    {
        $first = $this->send('履歴 1')->assertCreated()->json('message.id');
        $room = DB::table('chat_rooms')->value('id');
        foreach (range(2, 45) as $number) {
            DB::table('chat_messages')->insert([
                'chat_room_id' => $room, 'user_id' => $this->actor->id, 'employee_id' => $this->actor->employee_id,
                'client_message_id' => Str::uuid()->toString(), 'original_text' => '履歴 '.$number,
                'source_language' => 'ja',
            ]);
        }
        $url = '/api/internal-chat/messages';
        $latest = $this->getJson($url)->assertOk()->assertJsonCount(20, 'messages')->assertJsonPath('pagination.has_more', true);
        $this->getJson("$url/$first")->assertOk()->assertJsonPath('message.original_text', '履歴 1');
        $older = $this->getJson($url.'?before_id='.$latest->json('pagination.next_before_id'))
            ->assertOk()->assertJsonCount(20, 'messages')->assertJsonPath('pagination.has_more', true);
        $last = $this->getJson($url.'?before_id='.$older->json('pagination.next_before_id'))
            ->assertOk()->assertJsonCount(5, 'messages')->assertJsonPath('pagination.has_more', false);
        $ids = [...array_column($last->json('messages'), 'id'), ...array_column($older->json('messages'), 'id'),
            ...array_column($latest->json('messages'), 'id')];
        $this->assertSame(range($first, $first + 44), $ids);
    }

    public function test_reply_reference_recall_and_translation_redaction_are_durable(): void
    {
        $url = '/api/internal-chat/messages';
        $original = $this->send('Original confidential fixture')->assertCreated()->json('message.id');
        DB::table('chat_messages')->where('id', $original)->update(['translation_provider' => 'gemini']);
        $other = $this->fixtureUser('chat-replier', []);
        $this->actingAs($other);
        $payload = ['text' => 'Reply body only', 'client_message_id' => Str::uuid()->toString(), 'reply_to_message_id' => $original];
        $reply = $this->postJson($url, $payload)->assertCreated()
            ->assertJsonPath('message.reply_to.id', $original)->assertJsonPath('message.reply_to.excerpt', 'Original confidential fixture')
            ->json('message.id');
        $this->postJson($url, $payload)->assertCreated()->assertJsonPath('message.id', $reply);
        $this->postJson($url, [...$payload, 'reply_to_message_id' => null])->assertConflict();
        $this->patchJson("$url/$original/recall")->assertForbidden();
        $this->actingAs($this->actor);
        $action = $this->patchJson("$url/$original/recall")->assertOk()->assertJsonPath('chat_message_id', $original)->json('id');
        $this->patchJson("$url/$original/recall")->assertOk();
        $this->assertDatabaseCount('chat_message_actions', 1);
        $this->assertDatabaseHas('chat_message_actions', ['id' => $action, 'action' => 'recall', 'actor_user_id' => $this->actor->id]);
        $this->assertDatabaseHas('chat_messages', ['id' => $original, 'recalled_by' => $this->actor->id]);
        $this->assertDatabaseHas('chat_messages', ['id' => $original, 'original_text' => 'Original confidential fixture', 'user_id' => $this->actor->id]);
        $this->assertDatabaseHas('chat_messages', ['id' => $reply, 'reply_to_message_id' => $original, 'original_text' => 'Reply body only']);
        $this->actingAs($other);
        $this->getJson($url.'?after_action_id=0&translation_ids[]='.$original)->assertOk()
            ->assertJsonPath('action_cursor', $action)->assertJsonPath('message_actions.0.action', 'recall')
            ->assertJsonPath('messages.0.original_text', '')->assertJsonPath('messages.0.japanese_content', null)
            ->assertJsonPath('messages.1.reply_to.excerpt', null)->assertJsonCount(0, 'translation_updates');
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 0);
        $this->postJson($url, $payload)->assertCreated()->assertJsonPath('message.reply_to.excerpt', null);
        $this->postJson($url, [...$payload, 'client_message_id' => Str::uuid()->toString()])->assertConflict();
        $provider = \Mockery::mock(ChatTranslationProvider::class);
        $provider->shouldNotReceive('translate');
        (new TranslateChatMessage($original))->handle($provider);
    }

    public function test_any_chat_member_can_pin_and_unpin_with_audit_but_non_members_cannot(): void
    {
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonPath('can_pin', true);
        $message = $this->send('Pin fixture')->assertCreated()->json('message.id');
        $url = "/api/internal-chat/messages/$message";
        $nonEmployee = User::factory()->create(['employee_id' => null, 'is_active' => true, 'must_change_password' => false]);
        $this->actingAs($nonEmployee);
        $this->patchJson("$url/pin")->assertForbidden();
        $this->patchJson("$url/unpin")->assertForbidden();
        $colleague = $this->fixtureUser('chat-pin-colleague', []);
        $office = Office::create(['office_code' => 'CHAT-PIN-OTHER', 'name' => 'Synthetic pin office', 'status' => 'active']);
        $colleague->employee->update(['office_id' => $office->id]);
        $this->actingAs($colleague);
        $this->getJson('/api/internal-chat/messages')->assertJsonPath('can_pin', true);
        $this->patchJson("$url/recall")->assertForbidden();
        $this->patchJson("$url/pin", ['actor_user_id' => $this->actor->id])->assertUnprocessable();
        $this->patchJson("$url/pin")->assertOk();
        $this->patchJson("$url/pin")->assertOk();
        $this->assertDatabaseCount('chat_message_actions', 1);
        $this->assertDatabaseHas('chat_messages', ['id' => $message, 'pinned_by' => $colleague->id]);
        $this->actingAs($this->actor);
        $this->getJson('/api/internal-chat/pins')->assertOk()->assertJsonPath('messages.0.id', $message)
            ->assertJsonPath('messages.0.pinned_by_name', $colleague->name);
        $this->patchJson("$url/unpin")->assertOk();
        $this->getJson('/api/internal-chat/pins')->assertOk()->assertJsonCount(0, 'messages');
        $this->assertDatabaseHas('chat_message_actions', ['chat_message_id' => $message, 'action' => 'unpin', 'actor_user_id' => $this->actor->id]);
        $office->update(['status' => 'inactive']);
        $this->actingAs($colleague);
        $this->patchJson("$url/pin")->assertForbidden();
    }

    public function test_unread_count_and_mark_read_are_server_persisted(): void
    {
        $recipient = $this->fixtureUser('chat-recipient', []);
        $messageId = $this->send()->assertCreated()->json('message.id');
        $this->actingAs($recipient);
        $this->getJson('/api/internal-chat/unread')->assertOk()->assertJsonPath('unread_count', 1);
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $messageId])->assertOk();
        $this->patchJson('/api/internal-chat/read', ['message_id' => $messageId])
            ->assertOk()->assertJsonPath('unread_count', 0);
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 0);
    }

    public function test_hide_is_private_and_does_not_leak_via_details_replies_or_receipts(): void
    {
        $original = $this->send('Hidden original fixture')->assertCreated()->json('message.id');
        $url = '/api/internal-chat/messages';
        $reply = $this->postJson($url, ['text' => 'Visible reply', 'client_message_id' => Str::uuid()->toString(),
            'reply_to_message_id' => $original])->assertCreated()->json('message.id');
        $other = $this->fixtureUser('chat-hider', []);
        $this->actingAs($other);
        $this->getJson("$url/$original")->assertOk()->assertJsonPath('message.id', $original);
        $this->patchJson("$url/$original/hide")->assertOk();
        $this->patchJson("$url/$original/hide")->assertOk();
        $this->getJson("$url?after_action_id=0")->assertJsonCount(1, 'messages')->assertJsonPath('messages.0.reply_to', null)
            ->assertJsonPath('message_actions.0.action', 'hide');
        $this->getJson("$url/$original")->assertNotFound();
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 1);
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $reply])->assertOk();
        $this->patchJson('/api/internal-chat/read', ['message_id' => $reply, 'visible_ids' => [$reply]])
            ->assertOk()->assertJsonPath('read_cursor', $reply);
        $this->actingAs($this->actor);
        $this->getJson("$url?after_action_id=0")->assertJsonCount(2, 'messages')->assertJsonCount(0, 'message_actions')
            ->assertJsonPath("receipts.$original.read_count", 0)->assertJsonPath("receipts.$reply.read_count", 1);
        $this->assertDatabaseHas('chat_messages', ['id' => $original, 'original_text' => 'Hidden original fixture']);
        $this->assertDatabaseCount('chat_message_user_states', 1);
    }

    public function test_retry_is_owner_only_and_enqueues_one_audited_attempt(): void
    {
        $id = $this->send('Tin nhắn thử lại')->assertCreated()->json('message.id');
        DB::table('chat_messages')->where('id', $id)->update(['translation_status' => 'failed']);
        config(['chat_translation.provider' => 'gemini', 'chat_translation.gemini_key' => 'synthetic-only']);
        $other = $this->fixtureUser('chat-retry-other', []);
        $url = "/api/internal-chat/messages/$id";
        $this->actingAs($other)->patchJson("$url/retry")->assertForbidden();
        $this->actingAs($this->actor);
        $this->getJson($url)->assertJsonPath('message.can_retry_translation', true);
        $attempt = $this->patchJson("$url/retry")->assertOk()->json('id');
        $this->patchJson("$url/retry")->assertConflict();
        $this->getJson("/api/internal-chat/messages?after_id=$id&after_action_id=0")
            ->assertJsonPath('translation_updates.0.translation_status', 'pending');
        $queue = \Illuminate\Support\Facades\Queue::connection('database');
        $this->assertSame(1, $queue->size(TranslateChatMessage::QUEUE));
        (new TranslateChatMessage($id))->failed(null);
        $this->getJson($url)->assertJsonPath('message.translation_status', 'pending');
        $this->app->bind(ChatTranslationProvider::class, fn () => new class implements ChatTranslationProvider {
            public function translate(string $originalText, string $sourceLanguage): array
            {
                return ['japanese_content' => '再試行成功', 'vietnamese_content' => $originalText, 'status' => 'completed'];
            }
        });
        $job = $queue->pop(TranslateChatMessage::QUEUE);
        $job->fire();
        $job->delete();
        $this->getJson($url)->assertJsonPath('message.translation_status', 'completed')
            ->assertJsonPath('message.japanese_content', '再試行成功')->assertJsonPath('message.original_text', 'Tin nhắn thử lại');
        $this->assertDatabaseHas('chat_message_actions', ['id' => $attempt, 'chat_message_id' => $id,
            'actor_user_id' => $this->actor->id, 'action' => 'retry']);
        $this->actingAs($other);
        $this->getJson($url)->assertOk()->assertJsonPath('message.japanese_content', null)
            ->assertJsonCount(0, 'message.translations');
        $this->getJson("/api/internal-chat/messages?after_id=$id&after_action_id=0")
            ->assertJsonCount(0, 'message_actions')->assertJsonCount(0, 'translation_updates');
        $this->translate($id)->assertOk()->assertJsonPath('translations.ja-vi.text', '再試行成功');
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
    }

    public function test_receipts_require_recipient_acknowledgements_and_exclude_sender_and_inactive_members(): void
    {
        $first = $this->fixtureUser('receipt-first', []);
        $second = $this->fixtureUser('receipt-second', []);
        $inactive = $this->fixtureUser('receipt-inactive', []);
        $inactive->update(['is_active' => false]);
        foreach ([$this->actor, $this->actor, $first, $inactive] as $online) {
            $token = $online->createToken('chat-presence')->accessToken;
            $token->forceFill(['last_used_at' => now()])->save();
        }
        $second->createToken('stale-chat-presence')->accessToken
            ->forceFill(['last_used_at' => now()->subMinutes(3)])->save();
        $id = $this->send()->assertCreated()->json('message.id');
        $delta = '/api/internal-chat/messages?after_id='.$id.'&receipt_ids[]='.$id;
        $this->getJson($delta)->assertOk()->assertJsonCount(0, 'messages')
            ->assertJsonPath('member_summary.member_count', 3)
            ->assertJsonPath('member_summary.online_count', 2)
            ->assertJsonPath("receipts.$id.delivered_count", 0)
            ->assertJsonPath("receipts.$id.read_count", 0)
            ->assertJsonPath("receipts.$id.eligible_recipient_count", 2);

        $this->actingAs($first);
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonPath('messages.0.id', $id);
        $this->patchJson('/api/internal-chat/read', ['message_id' => $id])->assertConflict();
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $id + 100])->assertNotFound();
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $id])->assertOk();
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 1);
        $this->getJson($delta)->assertJsonPath("receipts.$id.delivered_count", 0)
            ->assertJsonPath("receipts.$id.readers", []);

        $this->actingAs($this->actor);
        $this->getJson($delta)->assertJsonPath("receipts.$id.delivered_count", 1)
            ->assertJsonPath("receipts.$id.read_count", 0);
        $this->actingAs($first);
        $this->patchJson('/api/internal-chat/read', ['message_id' => $id])->assertOk()->assertJsonPath('unread_count', 0);
        $this->actingAs($second);
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $id])->assertOk();
        $this->patchJson('/api/internal-chat/read', ['message_id' => $id])->assertOk();
        $this->actingAs($this->actor);
        $this->getJson($delta)->assertJsonPath("receipts.$id.read_count", 2)
            ->assertJsonPath("receipts.$id.readers.0.user_id", $first->id)
            ->assertJsonPath("receipts.$id.readers.0.display_name", $first->employee->full_name)
            ->assertJsonPath("receipts.$id.readers.1.user_id", $second->id)
            ->assertJsonMissingPath("receipts.$id.readers.0.email")
            ->assertJsonMissingPath("receipts.$id.readers.0.roles");
        $this->actingAs($first);
        $this->getJson($delta)->assertJsonPath("receipts.$id.delivered_count", 0)
            ->assertJsonPath("receipts.$id.readers.0.user_id", $first->id)
            ->assertJsonPath("receipts.$id.readers.1.user_id", $second->id);
        $this->actingAs($inactive);
        $this->getJson($delta)->assertUnauthorized();
    }

    public function test_first_unread_is_incoming_unseen_and_independent_of_the_latest_page(): void
    {
        $reader = $this->fixtureUser('unread-anchor', []);
        $oldest = $this->send('First unread')->assertCreated()->json('message.id');
        $recalled = $this->send('Recalled')->assertCreated()->json('message.id');
        $latest = $this->send('Latest unread')->assertCreated()->json('message.id');
        $this->patchJson("/api/internal-chat/messages/$recalled/recall")->assertOk();

        $this->actingAs($reader);
        $this->send('Own message')->assertCreated();
        $this->getJson("/api/internal-chat/messages?limit=1&receipt_ids[]=$recalled")->assertOk()
            ->assertJsonPath('unread_count', 2)->assertJsonPath('first_unread_id', $oldest)
            ->assertJsonMissingPath("receipts.$recalled");
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $latest])->assertOk();
        $this->patchJson('/api/internal-chat/read', ['message_id' => $latest, 'visible_ids' => [$latest]])
            ->assertOk()->assertJsonPath('unread_count', 1)->assertJsonPath('first_unread_id', $oldest);
        $this->patchJson('/api/internal-chat/read', ['message_id' => $oldest, 'visible_ids' => [$oldest]])
            ->assertOk()->assertJsonPath('unread_count', 0)->assertJsonPath('first_unread_id', null);
    }

    public function test_default_translation_is_pending_without_external_call(): void
    {
        $this->send('今日は会議があります。')->assertCreated()
            ->assertJsonPath('message.source_language', 'ja')
            ->assertJsonPath('message.japanese_content', '今日は会議があります。')
            ->assertJsonPath('message.vietnamese_content', null)
            ->assertJsonPath('message.translation_status', 'pending')
            ->assertJsonPath('message.translation_provider', 'pending');
        $this->send('Hom nay co cuoc hop.')->assertCreated()
            ->assertJsonPath('message.source_language', 'vi')
            ->assertJsonPath('message.vietnamese_content', 'Hom nay co cuoc hop.');
    }

    public function test_a_visible_newer_message_gets_a_receipt_without_marking_unseen_history(): void
    {
        $recipient = $this->fixtureUser('read-prefix', []);
        $older = $this->send('Older message')->assertCreated()->json('message.id');
        $newer = $this->send('Newer message')->assertCreated()->json('message.id');
        \App\Models\ChatReadState::query()->create([
            'chat_room_id' => \App\Models\ChatRoom::query()->sole()->id,
            'user_id' => $recipient->id,
            'last_read_message_id' => $older,
        ]);
        $this->actingAs($recipient);
        $this->patchJson('/api/internal-chat/delivered', ['message_id' => $newer])->assertOk();
        $this->actingAs($this->actor);
        $this->getJson('/api/internal-chat/messages')->assertOk()
            ->assertJsonPath("receipts.$newer.delivered_count", 1)
            ->assertJsonPath("receipts.$newer.read_count", 0);
        $this->actingAs($recipient);
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count', 1);
        $this->patchJson('/api/internal-chat/read', ['message_id' => $newer, 'visible_ids' => [$newer]])
            ->assertOk()->assertJsonPath('read_cursor', 0)->assertJsonPath('acknowledged_ids', [$newer])
            ->assertJsonPath('unread_count', 0);
        $this->actingAs($this->actor);
        $this->getJson('/api/internal-chat/messages')->assertOk()
            ->assertJsonPath("receipts.$older.read_count", 0)
            ->assertJsonPath("receipts.$newer.read_count", 1)
            ->assertJsonPath("receipts.$newer.readers.0.display_name", $recipient->employee->full_name)
            ->assertJsonPath("receipts.$newer.readers.0.avatar_url", $recipient->employee->avatar_path);
        $this->actingAs($recipient);
        $this->patchJson('/api/internal-chat/read', ['message_id' => $older, 'visible_ids' => [$older]])
            ->assertOk()->assertJsonPath('read_cursor', $newer);
        $this->actingAs($this->actor);
        $this->getJson('/api/internal-chat/messages')->assertOk()
            ->assertJsonPath("receipts.$older.read_count", 1)
            ->assertJsonPath("receipts.$newer.read_count", 1);
    }

    public function test_on_demand_translation_visibility_is_per_user_and_cached_per_pair(): void
    {
        config(['chat_translation.provider' => 'gemini', 'chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        $geminiText = fn (string $text) => ['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => $text]]]]]];
        Http::fake(['https://generativelanguage.googleapis.com/*' => Http::sequence()
            ->push($geminiText('Có cuộc họp.'))->push($geminiText("zh-Hans\n有会议。"))]);
        $key = (string) Str::uuid();
        $id = $this->send('会議です。', $key)->assertCreated()
            ->assertJsonPath('message.translation_provider', 'pending')->assertJsonCount(0, 'message.translations')->json('message.id');
        $this->send('会議です。', $key)->assertCreated()->assertJsonPath('message.id', $id);
        $this->send('OK')->assertCreated()->assertJsonPath('message.translation_status', 'completed');
        $queue = Queue::connection('database');
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        $this->translate($id, 'ja-en')->assertUnprocessable();
        $this->translate($id)->assertOk()->assertJsonPath('translations.ja-vi.status', 'pending');
        $this->patchJson("/api/internal-chat/messages/$id/pin")->assertOk();
        $other = $this->fixtureUser('chat-translation-recipient', []);
        $this->actingAs($other);
        $url = "/api/internal-chat/messages/$id";
        $poll = "/api/internal-chat/messages?after_id=$id&translation_ids%5B%5D=$id";
        $this->getJson($url)->assertOk()->assertJsonCount(0, 'message.translations');
        $this->assertSame(1, $queue->size(TranslateChatMessage::QUEUE));
        Http::assertNothingSent();
        $job = $queue->pop(TranslateChatMessage::QUEUE);
        $this->assertStringNotContainsString('会議です。', $job->getRawBody());
        $job->fire();
        $this->getJson($url)->assertOk()->assertJsonPath('message.original_text', '会議です。')
            ->assertJsonCount(0, 'message.translations');
        $this->getJson('/api/internal-chat/pins')->assertOk()->assertJsonCount(0, 'messages.0.translations');
        $this->getJson($poll)->assertOk()->assertJsonCount(0, 'translation_updates');
        $this->getJson('/api/internal-chat/messages?before_id='.($id + 1))
            ->assertOk()->assertJsonCount(0, 'messages.0.translations');

        $this->translate($id)->assertOk()->assertJsonPath('translations.ja-vi.text', 'Có cuộc họp.');
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        $this->translate($id, 'ja-zh')->assertOk()->assertJsonPath('translations.ja-zh.status', 'pending');
        $this->assertSame(1, $queue->size(TranslateChatMessage::QUEUE));
        $queue->pop(TranslateChatMessage::QUEUE)->fire();
        $this->getJson($poll)->assertOk()
            ->assertJsonPath('translation_updates.0.translations.ja-vi.text', 'Có cuộc họp.')
            ->assertJsonPath('translation_updates.0.translations.ja-zh.text', '有会议。')
            ->assertJsonPath('translation_updates.0.translations.ja-zh.language', 'zh-Hans')
            ->assertJsonMissingPath('translation_updates.0.translation_provider_metadata');
        $this->translate($id, 'ja-zh')->assertOk()->assertJsonPath('translations.ja-zh.status', 'completed');
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        $this->actingAs($this->actor)->getJson($poll)->assertOk()
            ->assertJsonPath('translation_updates.0.translations.ja-vi.text', 'Có cuộc họp.')
            ->assertJsonMissingPath('translation_updates.0.translations.ja-zh');
        $this->actingAs($other);
        $this->patchJson("/api/internal-chat/messages/$id/hide")->assertOk();
        $this->translate($id)->assertNotFound();
        Http::assertSentCount(2);
        $this->assertDatabaseHas('chat_messages', ['id' => $id, 'original_text' => '会議です。']);
    }

    public function test_old_automatic_translation_jobs_do_not_call_the_provider(): void
    {
        config(['chat_translation.provider' => 'gemini', 'chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        Http::fake();
        $id = $this->send('Tin nhắn khác.')->assertCreated()->assertJsonPath('message.translation_status', 'pending')->json('message.id');
        DB::table('chat_messages')->where('id', $id)->update(['translation_provider' => 'gemini']);
        (new TranslateChatMessage($id))->handle(app(ChatTranslationProvider::class));
        Http::assertNothingSent();
        $this->getJson('/api/internal-chat/messages')->assertOk()
            ->assertJsonPath('messages.0.original_text', 'Tin nhắn khác.')
            ->assertJsonCount(0, 'messages.0.translations');
    }

    public function test_translation_retries_rate_limits_and_connection_timeouts_then_updates_polling(): void
    {
        $this->freezeTime();
        config(['chat_translation.provider' => 'gemini', 'chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        Http::fake(['https://generativelanguage.googleapis.com/*' => Http::sequence()
            ->push(['error' => 'synthetic provider error'], 429, ['Retry-After' => '90'])
            ->pushFailedConnection('synthetic timeout')
            ->push([], 504, ['Retry-After' => now()->addSeconds(1210)->utc()->toRfc7231String()])
            ->push(['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => '会議です。']]]]]])]);
        $id = $this->send('Có cuộc họp.')->assertCreated()
            ->assertJsonPath('message.original_text', 'Có cuộc họp.')
            ->assertJsonPath('message.translation_status', 'pending')->json('message.id');
        $this->translate($id)->assertOk();
        $queue = Queue::connection('database');
        $first = $queue->pop(TranslateChatMessage::QUEUE);
        $this->assertGreaterThanOrEqual(3, $first->maxTries());
        $first->fire();
        $this->assertTrue($first->isReleased());
        $this->getJson("/api/internal-chat/messages/$id")->assertOk()
            ->assertJsonPath('message.original_text', 'Có cuộc họp.')
            ->assertJsonPath('message.translations.ja-vi.status', 'pending');
        $this->assertSame('provider_rate_limited', ChatMessage::findOrFail($id)->translation('ja-vi')['error_category']);
        $this->travel(89)->seconds();
        $this->assertNull($queue->pop(TranslateChatMessage::QUEUE));
        $this->travel(1)->seconds();
        $second = $queue->pop(TranslateChatMessage::QUEUE);
        $this->assertSame(2, $second->attempts());
        $second->fire();
        $this->assertTrue($second->isReleased());
        $this->assertSame('provider_connection_error', ChatMessage::findOrFail($id)->translation('ja-vi')['error_category']);
        $this->travel(119)->seconds();
        $this->assertNull($queue->pop(TranslateChatMessage::QUEUE));
        $this->travel(1)->seconds();
        $third = $queue->pop(TranslateChatMessage::QUEUE);
        $this->assertSame(3, $third->attempts());
        $third->fire();
        $this->assertTrue($third->isReleased());
        $this->assertSame('provider_timeout', ChatMessage::findOrFail($id)->translation('ja-vi')['error_category']);
        $this->travel(999)->seconds();
        $this->assertNull($queue->pop(TranslateChatMessage::QUEUE));
        $this->travel(1)->seconds();
        $queue->pop(TranslateChatMessage::QUEUE)->fire();
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        $this->getJson("/api/internal-chat/messages?after_id=$id&translation_ids%5B%5D=$id")->assertOk()
            ->assertJsonPath('translation_updates.0.translations.ja-vi.status', 'completed')
            ->assertJsonPath('translation_updates.0.translations.ja-vi.text', '会議です。');
        $this->assertNull(ChatMessage::findOrFail($id)->translation('ja-vi')['error_category']);
        $this->assertDatabaseCount('chat_messages', 1);
    }

    public function test_translation_retry_is_bounded_and_recalled_messages_are_not_sent_again(): void
    {
        config(['chat_translation.provider' => 'gemini', 'chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        Http::fake(['https://generativelanguage.googleapis.com/*' => Http::response([], 429)]);
        $queue = Queue::connection('database');
        $id = $this->send()->assertCreated()->json('message.id');
        $this->translate($id)->assertOk();
        foreach ([30, 120, 900, 3600, 14400, 68400] as $delay) {
            $job = $queue->pop(TranslateChatMessage::QUEUE);
            $job->fire();
            $this->assertTrue($job->isReleased());
            $this->travel($delay)->seconds();
        }
        $queue->pop(TranslateChatMessage::QUEUE)->fire();
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        $this->assertSame('failed', ChatMessage::findOrFail($id)->translation('ja-vi')['status']);
        $this->assertSame('provider_rate_limited', ChatMessage::findOrFail($id)->translation('ja-vi')['error_category']);
        Http::assertSentCount(7);

        $recalledId = $this->send()->assertCreated()->json('message.id');
        $this->translate($recalledId)->assertOk();
        $queue->pop(TranslateChatMessage::QUEUE)->fire();
        $this->patchJson("/api/internal-chat/messages/$recalledId/recall")->assertOk();
        $this->translate($recalledId)->assertNotFound();
        $this->travel(30)->seconds();
        $queue->pop(TranslateChatMessage::QUEUE)->fire();
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        Http::assertSentCount(8);
    }

    public function test_translation_does_not_retry_a_permanent_provider_error(): void
    {
        config(['chat_translation.provider' => 'gemini', 'chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        Http::fake(['https://generativelanguage.googleapis.com/*' => Http::response([], 403)]);
        $id = $this->send()->assertCreated()->json('message.id');
        $this->translate($id)->assertOk();
        $queue = Queue::connection('database');
        $queue->pop(TranslateChatMessage::QUEUE)->fire();
        $this->assertSame(0, $queue->size(TranslateChatMessage::QUEUE));
        $this->assertSame('failed', ChatMessage::findOrFail($id)->translation('ja-vi')['status']);
        $this->assertSame('translation_unavailable', ChatMessage::findOrFail($id)->translation('ja-vi')['error_category']);
        Http::assertSentCount(1);
    }

    public function test_invalid_payload_does_not_write(): void
    {
        $this->postJson('/api/internal-chat/messages', ['text' => '', 'client_message_id' => 'not-a-uuid'])
            ->assertUnprocessable()->assertJsonValidationErrors(['text', 'client_message_id']);
        $this->postJson('/api/internal-chat/messages', ['text' => str_repeat('a', 2001), 'client_message_id' => (string) Str::uuid()])
            ->assertUnprocessable()->assertJsonValidationErrors('text');
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_singleton_database_rejects_a_second_room(): void
    {
        $this->send()->assertCreated();
        $this->expectException(\Illuminate\Database\QueryException::class);
        \Illuminate\Support\Facades\DB::table('chat_rooms')->insert([
            'singleton_slot' => 2, 'kind' => 'general', 'name' => 'THEMIS_GENERAL', 'office_id' => $this->actor->employee->office_id,
        ]);
    }

    public function test_inactive_employee_cannot_use_the_shared_room(): void
    {
        $this->actor->employee->update(['status' => 'inactive']);
        $this->getJson('/api/internal-chat/messages')->assertUnauthorized();
        $this->send()->assertUnauthorized();
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_legacy_office_histories_merge_without_changing_message_ids_or_text(): void
    {
        $db=\Illuminate\Support\Facades\DB::class;
        $schema=\Illuminate\Support\Facades\Schema::class;
        $schema::drop('chat_message_user_states'); $schema::drop('chat_message_actions'); $schema::drop('chat_read_states'); $schema::drop('chat_messages'); $schema::drop('chat_rooms');
        (require database_path('migrations/2026_11_02_100000_create_internal_chat.php'))->up();
        $other=$this->fixtureUser('merge-other', []);
        $otherOffice=Office::create(['office_code'=>'MERGE','name'=>'Synthetic merge office','status'=>'active']);
        $other->employee->update(['office_id'=>$otherOffice->id]);
        foreach([$this->actor, $other] as $index=>$user) {
            $room=$db::table('chat_rooms')->insertGetId(['office_id'=>$user->employee->office_id,'kind'=>'general','name'=>'old']);
            $message=$db::table('chat_messages')->insertGetId(['chat_room_id'=>$room,'user_id'=>$user->id,
                'employee_id'=>$user->employee_id,'client_message_id'=>(string) Str::uuid(),'original_text'=>'legacy-'.$index,
                'source_language'=>'vi']);
            $db::table('chat_read_states')->insert(['chat_room_id'=>$room,'user_id'=>$user->id,'last_read_message_id'=>$message]);
        }
        $before=$db::table('chat_messages')->orderBy('id')->get(['id','original_text','user_id','client_message_id'])->toJson();
        (require database_path('migrations/2026_11_02_210000_make_internal_chat_singleton.php'))->up();
        $this->assertSame($before,$db::table('chat_messages')->orderBy('id')->get(['id','original_text','user_id','client_message_id'])->toJson());
        $this->assertDatabaseCount('chat_rooms',1);
        $this->assertSame(1,$db::table('chat_messages')->distinct()->count('chat_room_id'));
        $this->assertSame(0,$db::table('chat_read_states')->whereNotNull('last_read_message_id')->count());
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonCount(2,'messages');
        $this->getJson('/api/internal-chat/unread')->assertJsonPath('unread_count',1);
    }

    public function test_missing_schema_returns_safe_retryable_error_without_sql_or_message_content(): void
    {
        Schema::drop('chat_message_user_states');
        Schema::drop('chat_message_actions');
        \Illuminate\Support\Facades\Schema::drop('chat_read_states');
        \Illuminate\Support\Facades\Schema::drop('chat_messages');
        \Illuminate\Support\Facades\Schema::drop('chat_rooms');
        \Illuminate\Support\Facades\Log::spy();
        $response = $this->getJson('/api/internal-chat/messages')->assertStatus(503)
            ->assertJsonPath('message', 'チャットを読み込めませんでした。管理者にお問い合わせください。');
        $this->assertEqualsCanonicalizing(['message', 'request_id'], array_keys($response->json()));
        $this->assertTrue(Str::isUuid($response->json('request_id')));
        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
        \Illuminate\Support\Facades\Log::shouldHaveReceived('warning')->once()->withArgs(
            fn ($event, $context) => $event === 'internal_chat.storage_failure'
                && $context['error_category'] === 'storage_unavailable'
                && array_keys($context) === ['request_id', 'error_category']
        );
    }
}
