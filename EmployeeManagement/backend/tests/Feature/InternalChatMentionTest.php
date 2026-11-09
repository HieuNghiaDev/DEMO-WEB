<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\EmployeeNotification;
use App\Models\User;
use App\Services\CaseNotificationAccess;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Tests\Support\B21\B21TestCase;

class InternalChatMentionTest extends B21TestCase
{
    private User $sender;
    private User $recipient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sender = $this->fixtureUser('mention-sender', []);
        $this->recipient = $this->fixtureUser('mention-recipient', []);
        $this->recipient->employee->update(['full_name' => '受信者 テスト']);
        $this->actingAs($this->sender);
    }

    private function payload(?string $key = null): array
    {
        return ['text' => '📎 @受信者 テスト 確認をお願いします。', 'client_message_id' => $key ?? (string) Str::uuid(),
            'mentions' => [['type' => 'user', 'user_id' => $this->recipient->id, 'start' => 3, 'end' => 11]]];
    }

    public function test_unicode_mention_persists_and_notifies_without_content_or_pii(): void
    {
        $id = $this->postJson('/api/internal-chat/messages', $this->payload())->assertCreated()
            ->assertJsonPath('message.mentions.0.name', '受信者 テスト')->assertJsonPath('message.mentions.0.start', 3)->json('message.id');
        $this->getJson("/api/internal-chat/messages/{$id}")->assertOk()->assertJsonPath('message.mentions.0.user_id', $this->recipient->id);
        $this->assertDatabaseCount('employee_notifications', 1);
        $notice = EmployeeNotification::firstOrFail();
        $this->assertSame($this->recipient->id, $notice->user_id);
        $this->assertSame(['chat_message_id' => $id], $notice->data);
        $this->assertStringNotContainsString('確認をお願いします', $notice->message);
        $this->actingAs($this->recipient);
        $this->getJson('/api/internal-chat/messages')->assertOk()->assertJsonPath('messages.0.mentions.0.name', '受信者 テスト');
        $this->getJson('/api/notifications/center?details=1')->assertOk()->assertJsonPath('notifications.0.chat_message_id', $id);
    }

    public function test_retry_does_not_duplicate_notifications_and_changed_target_conflicts(): void
    {
        $payload = $this->payload();
        $this->postJson('/api/internal-chat/messages', $payload)->assertCreated();
        $this->postJson('/api/internal-chat/messages', $payload)->assertCreated();
        $this->assertDatabaseCount('chat_messages', 1);
        $this->assertDatabaseCount('employee_notifications', 1);
        $payload['mentions'] = [];
        $this->postJson('/api/internal-chat/messages', $payload)->assertConflict();
        $this->assertDatabaseCount('employee_notifications', 1);
    }

    public function test_forged_bot_label_range_overlap_and_missing_member_are_denied(): void
    {
        foreach (['bot', 'name', 'range', 'overlap', 'missing'] as $invalid) {
            $payload = $this->payload();
            if ($invalid === 'bot') $payload['mentions'][0]['type'] = 'bot';
            if ($invalid === 'name') $payload['mentions'][0]['name'] = 'Forged';
            if ($invalid === 'range') $payload['mentions'][0]['start'] = 4;
            if ($invalid === 'overlap') $payload['mentions'][] = $payload['mentions'][0];
            if ($invalid === 'missing') $payload['mentions'][0]['user_id'] = 999999;
            $this->postJson('/api/internal-chat/messages', $payload)->assertUnprocessable();
        }
        $this->assertDatabaseCount('chat_messages', 0);
        $this->assertDatabaseCount('employee_notifications', 0);
    }

    public function test_inactive_targets_are_not_suggested_and_cannot_be_mentioned(): void
    {
        $this->recipient->update(['is_active' => false]);
        $this->getJson('/api/internal-chat/members?q='.urlencode('受信者'))->assertOk()->assertJsonPath('members', []);
        $this->postJson('/api/internal-chat/messages', $this->payload())->assertUnprocessable();
        $this->recipient->update(['is_active' => true]);
        $this->recipient->employee->update(['status' => 'inactive']);
        $this->postJson('/api/internal-chat/messages', $this->payload())->assertUnprocessable();
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_members_endpoint_requires_eligible_session_and_returns_only_directory_fields(): void
    {
        $member = $this->getJson('/api/internal-chat/members?q='.urlencode('受信者'))->assertOk()->json('members.0');
        $keys = array_keys($member); sort($keys);
        $this->assertSame(['avatar_path', 'employee_code', 'employee_id', 'name', 'user_id'], $keys);
        $this->assertSame($this->recipient->id, $member['user_id']);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/internal-chat/members')->assertUnauthorized();
        $outsider = User::factory()->create(['employee_id' => null, 'is_active' => true, 'must_change_password' => false]);
        $this->actingAs($outsider)->getJson('/api/internal-chat/members')->assertForbidden();
    }

    public function test_self_mentions_and_repeated_same_recipient_do_not_duplicate_notices(): void
    {
        $label = '@受信者 テスト';
        $payload = $this->payload();
        $payload['text'] = $label.' '.$label;
        $payload['mentions'] = [
            ['type' => 'user', 'user_id' => $this->recipient->id, 'start' => 0, 'end' => 8],
            ['type' => 'user', 'user_id' => $this->recipient->id, 'start' => 9, 'end' => 17],
        ];
        $this->postJson('/api/internal-chat/messages', $payload)->assertCreated();
        $this->actingAs($this->recipient);
        $this->postJson('/api/internal-chat/messages', $this->payload())->assertCreated();
        $this->assertDatabaseCount('employee_notifications', 1);
    }

    public function test_notification_is_hidden_after_recall_hide_or_membership_ineligibility(): void
    {
        $id = $this->postJson('/api/internal-chat/messages', $this->payload())->assertCreated()->json('message.id');
        $notice = EmployeeNotification::firstOrFail();
        $access = app(CaseNotificationAccess::class);
        $this->assertTrue($access->allows($notice, $this->recipient));
        $this->actingAs($this->recipient)->patchJson("/api/internal-chat/messages/{$id}/hide")->assertOk();
        $this->assertFalse($access->allows($notice, $this->recipient));
        $this->actingAs($this->sender)->patchJson("/api/internal-chat/messages/{$id}/recall")->assertOk();
        $this->getJson("/api/internal-chat/messages/{$id}")->assertOk()->assertJsonPath('message.mentions', []);
        $this->recipient->update(['is_active' => false]);
        $this->assertFalse($access->allows($notice, $this->recipient));
    }

    public function test_notification_failure_rolls_back_message_and_attachments(): void
    {
        EmployeeNotification::creating(function () { throw new \RuntimeException('synthetic notification failure'); });
        try {
            $this->withoutExceptionHandling();
            $this->post('/api/internal-chat/messages', [...$this->payload(), 'attachments' => [UploadedFile::fake()->createWithContent('test.pdf', "%PDF-1.4\nsynthetic\n%%EOF")]], ['Accept' => 'application/json']);
            $this->fail('Expected failure');
        } catch (\RuntimeException $error) {
            $this->assertSame('synthetic notification failure', $error->getMessage());
        } finally {
            EmployeeNotification::flushEventListeners();
        }
        $this->assertDatabaseCount('chat_messages', 0);
        $this->assertDatabaseCount('employee_notifications', 0);
        $this->assertSame([], \Illuminate\Support\Facades\Storage::disk('local')->allFiles('internal-chat'));
    }

    public function test_mentions_with_attachment_use_existing_upload_workflow(): void
    {
        $this->post('/api/internal-chat/messages', [...$this->payload(), 'attachments' => [UploadedFile::fake()->createWithContent('test.pdf', "%PDF-1.4\nsynthetic\n%%EOF")]], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('message.mentions.0.user_id', $this->recipient->id)->assertJsonPath('message.attachments.0.name', 'test.pdf');
        $this->assertDatabaseCount('chat_messages', 1);
    }
}
