<?php

namespace App\Services;

use App\Jobs\TranslateChatMessage;
use App\Models\ChatMessage;
use App\Models\ChatReadState;
use App\Models\ChatRoom;
use App\Models\User;
use App\Models\EmployeeNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class InternalChatService
{
    private const MAX_PINS = 20;

    private function eligibleOfficeId(User $actor): int
    {
        $employee = $actor->is_active ? $actor->employee()
            ->leftJoin('offices', 'offices.id', '=', 'employees.office_id')
            ->first(['employees.office_id', 'employees.status', 'offices.status as office_status']) : null;
        if ($employee?->status !== 'active' || $employee->office_status !== 'active') {
            throw new HttpException(403, '社内チャットを利用する権限がありません。');
        }
        return (int) $employee->office_id;
    }

    public function room(User $actor, bool $create = false): ?ChatRoom
    {
        $officeId = $this->eligibleOfficeId($actor);
        // Office remains an eligibility prerequisite, never a conversation scope.
        if ($create) {
            return ChatRoom::query()->firstOrCreate(['singleton_slot' => 1], [
                'name' => 'THEMIS_GENERAL', 'kind' => 'general',
                'office_id' => $officeId, // Retained legacy provenance only; never used for room selection.
            ]);
        }
        return ChatRoom::query()->where('singleton_slot', 1)->where('name', 'THEMIS_GENERAL')->first();
    }

    public function messages(User $actor, ?int $afterId, ?int $beforeId, int $limit, array $receiptIds = [], array $translationIds = [], ?int $afterActionId = null): array
    {
        $room = $this->room($actor);
        $actionsEnabled = Schema::hasTable('chat_message_actions');
        $phaseTwo = $actionsEnabled && Schema::hasTable('chat_message_user_states');
        $canRetryTranslation = $phaseTwo && $this->translationConfigured();
        $deliveryEnabled = $this->receiptsAvailable();
        $members = $this->members($room, $deliveryEnabled);
        $online = EmployeeOnlinePresence::userIds();
        $summary = [
            'member_count' => $members->count(),
            'online_count' => $members->filter(fn ($member) => isset($online[$member->user_id]))->count(),
        ];
        if (! $room) {
            return ['messages' => [], 'pagination' => ['has_more' => false, 'next_before_id' => null, 'latest_id' => null],
                'unread_count' => 0, 'first_unread_id' => null, 'member_summary' => $summary, 'receipts' => (object) [], 'delivery_enabled' => $deliveryEnabled,
                'translation_updates' => [], 'actions_enabled' => $actionsEnabled, 'can_pin' => $actionsEnabled,
                'action_cursor' => 0, 'message_actions' => [], 'hide_enabled' => $phaseTwo];
        }

        $actions = collect();
        $actionCursor = 0;
        if ($actionsEnabled && $beforeId === null) {
            $actionQuery = DB::table('chat_message_actions')->where('chat_room_id', $room->id)
                ->where(fn ($query) => $query->whereNotIn('action', ['hide', 'retry'])->orWhere('actor_user_id', $actor->id));
            if ($afterActionId === null) {
                // Capture the cursor before reading messages so concurrent changes are replayed.
                $actionCursor = (int) $actionQuery->max('id');
            } else {
                $actions = $actionQuery->where('id', '>', $afterActionId)->orderBy('id')->limit(50)
                    ->get(['id', 'chat_message_id', 'action', 'created_at']);
                $actionCursor = (int) ($actions->last()->id ?? $afterActionId);
            }
        }
        $query = $this->withoutHidden($this->messageQuery($room, $actionsEnabled, $actor, $phaseTwo), $actor, $phaseTwo);
        if ($afterId !== null) {
            $items = $query->where('id', '>', $afterId)->orderBy('id')->limit($limit)->get();
            $hasMore = false;
        } else {
            if ($beforeId !== null) {
                $query->where('id', '<', $beforeId);
            }
            $items = $query->orderByDesc('id')->limit($limit + 1)->get();
            $hasMore = $items->count() > $limit;
            $items = $items->take($limit)->reverse()->values();
        }

        $receiptSenders = $items->whereNull('recalled_at')->pluck('user_id', 'id');
        $remainingReceiptIds = array_diff($receiptIds, $items->pluck('id')->all());
        if ($remainingReceiptIds !== []) {
            $receiptSenders = $receiptSenders->union($this->withoutHidden(ChatMessage::query(), $actor, $phaseTwo)
                ->where('chat_room_id', $room->id)
                ->when($actionsEnabled, fn ($query) => $query->whereNull('recalled_at'))
                ->whereIn('id', $remainingReceiptIds)->pluck('user_id', 'id'));
        }
        $messageIds = $receiptSenders->keys();
        $hiddenUnread = $phaseTwo && $messageIds->isNotEmpty() ? DB::table('chat_message_user_states')
            ->whereIn('chat_message_id', $messageIds)->where('read_before_hide', false)
            ->get(['chat_message_id', 'user_id'])->groupBy('chat_message_id')
            ->map(fn ($states) => $states->keyBy('user_id')) : collect();
        $views = $messageIds->isNotEmpty() && Schema::hasTable('chat_message_views') ? DB::table('chat_message_views')
            ->whereIn('chat_message_id', $messageIds)->get()->groupBy('chat_message_id')
            ->map(fn ($rows) => $rows->keyBy('user_id')) : collect();
        $receipts = $receiptSenders->map(function ($senderId, $id) use ($actor, $members, $hiddenUnread, $views) {
            $recipients = $members->reject(fn ($member) => (int) $member->user_id === (int) $senderId);
            $readers = $recipients->filter(fn ($member) => ($member->last_visible_read_message_id >= $id
                || isset($views[$id][$member->user_id]))
                && ! isset($hiddenUnread[$id][$member->user_id]));

            return [
                'delivered_count' => (int) $senderId === (int) $actor->id
                    ? $recipients->filter(fn ($member) => $member->last_delivered_message_id >= $id)->count() : 0,
                'read_count' => $readers->count(),
                'eligible_recipient_count' => $recipients->count(),
                'readers' => $readers->map(fn ($member) => [
                    'user_id' => (int) $member->user_id,
                    'employee_id' => (int) $member->employee_id,
                    'display_name' => $member->full_name,
                    'avatar_url' => $member->avatar_path,
                ])->values()->all(),
            ];
        });

        // An initial page already includes the newest message. A full delta can have more pages.
        $latestId = match (true) {
            $afterId === null && $beforeId === null => $items->last()?->id,
            $afterId !== null && $items->isNotEmpty() && $items->count() < $limit => $items->last()->id,
            default => $this->withoutHidden(ChatMessage::query(), $actor, $phaseTwo)->where('chat_room_id', $room->id)->max('id'),
        };

        $translationIds = array_unique([...$translationIds, ...$actions->where('action', 'retry')->pluck('chat_message_id')->all()]);
        return [
            'messages' => $items->map(fn (ChatMessage $message) => $this->serialize($message, $actor, $canRetryTranslation))->all(),
            'pagination' => [
                'has_more' => $hasMore,
                'next_before_id' => $items->first()?->id,
                'latest_id' => $latestId,
            ],
            ...$this->unreadSummaryForRoom($actor, $room, $actionsEnabled, $phaseTwo),
            'member_summary' => $summary,
            'receipts' => (object) $receipts->all(),
            'delivery_enabled' => $deliveryEnabled,
            'actions_enabled' => $actionsEnabled,
            'hide_enabled' => $phaseTwo,
            'can_pin' => $actionsEnabled,
            'action_cursor' => $actionCursor,
            'message_actions' => $actions->all(),
            'translation_updates' => $translationIds === [] ? [] : $this->withoutHidden(ChatMessage::query(), $actor, $phaseTwo)
                ->where('chat_room_id', $room->id)->whereIn('id', $translationIds)
                ->when($actionsEnabled, fn ($query) => $query->whereNull('recalled_at'))
                ->get(['id', 'source_language', 'translation_status', 'translation_error_category', 'japanese_content', 'vietnamese_content',
                    'translation_provider_metadata', 'translation_provider', ...($phaseTwo ? ['translation_attempt'] : [])])
                ->filter(fn (ChatMessage $message) => $message->translationRequestedBy($actor->id, 'ja-vi')
                    || $message->translationRequestedBy($actor->id, 'ja-zh'))
                ->map(fn (ChatMessage $message) => ['id' => $message->id, ...$this->translationPayload($message, $actor)])
                ->values()->all(),
        ];
    }

    private function members(?ChatRoom $room, bool $deliveryEnabled): \Illuminate\Support\Collection
    {
        return $this->memberQuery()
            ->leftJoin('chat_read_states as receipts', function ($join) use ($room) {
                $join->on('receipts.user_id', '=', 'users.id')->where('receipts.chat_room_id', '=', $room?->id ?? 0);
            })
            ->orderBy('users.id')
            ->select('users.id as user_id', 'employees.id as employee_id', 'employees.full_name', 'employees.avatar_path')
            ->selectRaw($deliveryEnabled
                ? 'receipts.last_delivered_message_id, receipts.last_visible_read_message_id'
                : 'NULL as last_delivered_message_id, NULL as last_visible_read_message_id')
            ->get();
    }

    private function memberQuery(): \Illuminate\Database\Query\Builder
    {
        return DB::table('users')->join('employees', 'employees.id', '=', 'users.employee_id')
            ->join('offices', 'offices.id', '=', 'employees.office_id')
            ->where('users.is_active', true)->where('users.activation_required', false)
            ->whereNull('employees.deleted_at')
            ->where('employees.status', 'active')->where('offices.status', 'active');
    }

    public function mentionCandidates(User $actor, string $query): array
    {
        $this->eligibleOfficeId($actor);
        abort_unless(Schema::hasColumn('chat_messages', 'mentions'), 503, 'メンションは現在準備中です。');
        return $this->memberQuery()->when(trim($query) !== '', fn ($members) => $members->where(fn ($search) => $search
            ->where('employees.full_name', 'like', '%'.trim($query).'%')
            ->orWhere('employees.full_name_kana', 'like', '%'.trim($query).'%')
            ->orWhere('employees.employee_code', 'like', '%'.trim($query).'%')))
            ->orderBy('employees.full_name')->orderBy('users.id')->limit(20)
            ->get(['users.id as user_id', 'employees.id as employee_id', 'employees.full_name as name',
                'employees.employee_code', 'employees.avatar_path'])->all();
    }

    public function visibleMessageIds(User $actor, array $ids): array
    {
        if ($ids === []) return [];
        try {
            $room = $this->room($actor);
        } catch (HttpException $error) {
            if ($error->getStatusCode() === 403) return [];
            throw $error;
        }
        if (! $room) return [];
        return $this->withoutHidden(ChatMessage::query(), $actor, Schema::hasTable('chat_message_user_states'))
            ->where('chat_room_id', $room->id)->whereIn('id', $ids)->whereNull('recalled_at')->pluck('id')->all();
    }

    private function receiptsAvailable(): bool
    {
        return Schema::hasColumns('chat_read_states', ['last_delivered_message_id', 'last_visible_read_message_id']);
    }

    /** @return array<string,mixed> */
    /** @param list<UploadedFile> $files */
    public function send(User $actor, string $text, string $clientMessageId, ?int $replyId = null, array $files = [], array $mentions = []): array
    {
        abort_if(count($mentions) > 10 || collect($mentions)->contains(fn ($mention) => ($mention['type'] ?? null) !== 'user'), 422);
        $mentions = array_map(fn (array $mention) => ['type' => 'user', 'user_id' => (int) $mention['user_id'],
            'start' => (int) $mention['start'], 'end' => (int) $mention['end']], $mentions);
        usort($mentions, fn ($left, $right) => $left['start'] <=> $right['start']);
        if ($mentions) {
            $this->eligibleOfficeId($actor);
            abort_unless(Schema::hasColumn('chat_messages', 'mentions'), 503, 'メンションは現在準備中です。');
        }
        if ($files) {
            $this->eligibleOfficeId($actor);
            abort_unless(Schema::hasColumn('chat_messages', 'attachments'), 503, '添付ファイルは現在利用できません。');
        }

        $text = trim($text);
        $attachments = array_map(function (UploadedFile $file): array {
            $name = preg_replace('/[\p{C}\/\\\\%]+/u', '_', $file->getClientOriginalName()) ?? 'attachment';
            $extension = strtolower($file->getClientOriginalExtension());
            $name = Str::substr(pathinfo($name, PATHINFO_FILENAME), 0, 120).'.'.$extension;
            $digest = hash_file('sha256', $file->getPathname());
            abort_if($digest === false, 503, '添付ファイルを読み込めませんでした。');

            return ['name' => $name, 'size' => $file->getSize(), 'mime_type' => $file->getMimeType(), 'sha256' => $digest];
        }, $files);
        $written = [];
        try {
            return $this->storeMessage($actor, $text, $clientMessageId, $replyId, $files, $attachments, $mentions, $written);
        } catch (\Throwable $error) {
            if ($written) Storage::disk('local')->delete($written);
            throw $error;
        }
    }

    private function storeMessage(User $actor, string $text, string $clientMessageId, ?int $replyId, array $files, array $attachments, array $mentions, array &$written): array
    {
        return DB::transaction(function () use ($actor, $text, $clientMessageId, $replyId, $files, $attachments, $mentions, &$written): array {
            $room = $this->room($actor, true);
            $actionsEnabled = Schema::hasTable('chat_message_actions');
            $phaseTwo = $actionsEnabled && Schema::hasTable('chat_message_user_states');
            $canRetryTranslation = $phaseTwo && $this->translationConfigured();
            abort_if($replyId !== null && ! $actionsEnabled, 409, '返信は現在利用できません。');
            $query = $this->messageQuery($room, $actionsEnabled, $actor, $phaseTwo);
            $existing = (clone $query)
                ->where('user_id', $actor->id)->where('client_message_id', $clientMessageId)->first();
            if ($existing) {
                $this->assertSameSend($existing, $text, $replyId, $attachments, $mentions);
                abort_if($phaseTwo && $this->hidden($actor, $existing->id), 404);
                return $this->serialize($existing, $actor, $canRetryTranslation);
            }

            $resolvedMentions = $this->resolveMentions($text, $mentions);
            if ($replyId !== null) {
                $parent = ChatMessage::query()->where('chat_room_id', $room->id)->lockForUpdate()->findOrFail($replyId);
                abort_if($phaseTwo && $this->hidden($actor, $replyId), 404);
                abort_if($parent->recalled_at !== null, 409, 'このメッセージには返信できません。');
            }
            $hasVietnamese = preg_match('/[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ\x{1EA0}-\x{1EF9}]/iu', $text);
            $sourceLanguage = ! $hasVietnamese && preg_match('/[\p{Hiragana}\p{Katakana}\p{Han}]/u', $text) ? 'ja' : 'vi';
            $neutral = $text === '' || preg_match('/^ok[.!！。]?$/iu', $text) === 1;
            $message = ChatMessage::query()->createOrFirst([
                'chat_room_id' => $room->id,
                'user_id' => $actor->id,
                'client_message_id' => $clientMessageId,
            ], [
                'employee_id' => $actor->employee_id,
                'original_text' => $text,
                'source_language' => $sourceLanguage,
                'japanese_content' => $sourceLanguage === 'ja' || $neutral ? $text : null,
                'vietnamese_content' => $sourceLanguage === 'vi' || $neutral ? $text : null,
                'translation_status' => $neutral ? 'completed' : 'pending',
                'translation_provider' => $neutral ? 'identity' : 'pending',
                ...($replyId === null ? [] : ['reply_to_message_id' => $replyId]),
                ...($resolvedMentions === [] ? [] : ['mentions' => $resolvedMentions]),
            ]);
            if ($message->wasRecentlyCreated && $files) {
                $disk = Storage::disk('local');
                foreach ($files as $index => $file) {
                    $name = (string) Str::uuid();
                    $written[] = $path = 'internal-chat/'.$name;
                    abort_if($disk->putFileAs('internal-chat', $file, $name) === false, 503, '添付ファイルを保存できませんでした。');
                    $attachments[$index]['path'] = $path;
                }
                $message->forceFill(['attachments' => $attachments])->save();
            } else {
                $this->assertSameSend($message, $text, $replyId, $attachments, $mentions);
                abort_if($phaseTwo && ! $message->wasRecentlyCreated && $this->hidden($actor, $message->id), 404);
            }
            if ($message->wasRecentlyCreated) {
                foreach (array_unique(array_column($resolvedMentions, 'user_id')) as $userId) {
                    if ($userId === (int) $actor->id) continue;
                    EmployeeNotification::create([
                        'user_id' => $userId, 'kind' => 'chat_mention', 'title' => 'チャットでメンションされました',
                        'message' => '社内チャットであなた宛てのメッセージがあります。',
                        'data' => ['chat_message_id' => $message->id],
                    ]);
                }
            }
            return $this->serialize($query->findOrFail($message->id), $actor, $canRetryTranslation);
        }, $files ? 1 : 3);
    }

    private function assertSameSend(ChatMessage $message, string $text, ?int $replyId, array $attachments, array $mentions): void
    {
        $stored = array_map(fn (array $item) => \Illuminate\Support\Arr::except($item, 'path'), $message->attachments ?? []);
        $storedMentions = array_map(fn (array $item) => \Illuminate\Support\Arr::except($item, 'name'), $message->mentions ?? []);
        abort_if($message->original_text !== $text || $message->reply_to_message_id !== $replyId || $stored != $attachments || $storedMentions != $mentions,
            409, '同じ送信IDで異なるメッセージは登録できません。');
    }

    private function resolveMentions(string $text, array $mentions): array
    {
        if ($mentions === []) return [];
        $members = $this->memberQuery()->whereIn('users.id', array_column($mentions, 'user_id'))
            ->get(['users.id as user_id', 'employees.full_name'])->keyBy('user_id');
        $utf16 = mb_convert_encoding($text, 'UTF-16LE', 'UTF-8');
        $end = 0;
        foreach ($mentions as &$mention) {
            $member = $members->get($mention['user_id']);
            abort_unless($member && $mention['start'] >= $end && $mention['end'] > $mention['start']
                && $mention['end'] * 2 <= strlen($utf16), 422, 'メンションするメンバーを選び直してください。');
            $label = mb_convert_encoding(substr($utf16, $mention['start'] * 2, ($mention['end'] - $mention['start']) * 2), 'UTF-8', 'UTF-16LE');
            abort_unless($label === '@'.$member->full_name, 422, 'メンションするメンバーを選び直してください。');
            $mention['name'] = $member->full_name;
            $end = $mention['end'];
        }
        return $mentions;
    }

    private function translationConfigured(): bool
    {
        return config('chat_translation.provider') === 'gemini'
            && trim((string) config('chat_translation.gemini_key')) !== '';
    }

    private function enqueueTranslation(int $id, int $attempt, ?string $pair = null): void
    {
        $queueConnection = config('queue.connections.database.connection');
        if ($queueConnection !== null && $queueConnection !== config('database.default')) {
            throw new \RuntimeException('Chat translation queue must share the message database.');
        }
        Bus::dispatch((new TranslateChatMessage($id, $attempt, $pair))
            ->onConnection('database')->onQueue(TranslateChatMessage::QUEUE)->beforeCommit());
    }

    public function requestTranslation(User $actor, int $id, string $pair): object
    {
        $room = $this->room($actor);
        abort_unless($room && in_array($pair, ChatMessage::TRANSLATION_PAIRS, true), 404);

        return DB::transaction(function () use ($actor, $id, $pair, $room): object {
            $message = $this->withoutHidden(ChatMessage::query()->where('chat_room_id', $room->id), $actor,
                Schema::hasTable('chat_message_user_states'))->lockForUpdate()->findOrFail($id);
            abort_if($message->recalled_at !== null || $message->original_text === '', 404);
            $previous = $message->translation($pair);
            $reusable = in_array($previous['status'] ?? null, ['pending', 'completed'], true);
            $now = now()->timestamp;
            if (! $reusable) {
                abort_unless($this->translationConfigured(), 503, '翻訳は現在利用できません。');
                abort_if(($previous['requested_at'] ?? 0) > $now - 30, 429);
            }

            $message->markTranslationRequested($actor->id, $pair);
            if (! $reusable) {
                $revision = ($previous['revision'] ?? 0) + 1;
                $message->storeTranslation($pair, ['status' => 'pending', 'revision' => $revision, 'requested_at' => $now]);
                $this->enqueueTranslation($id, $revision, $pair);
            } elseif ($message->isDirty('translation_provider_metadata')) {
                $message->save();
            }

            return $message->translationsFor($actor->id);
        }, 3);
    }

    private function hidden(User $actor, int $id): bool
    {
        return DB::table('chat_message_user_states')->where('user_id', $actor->id)
            ->where('chat_message_id', $id)->exists();
    }

    private function withoutHidden(Builder $query, User $actor, bool $enabled): Builder
    {
        return $query->when($enabled, fn ($messages) => $messages->whereNotExists(fn ($hidden) => $hidden
            ->selectRaw('1')->from('chat_message_user_states')->where('user_id', $actor->id)
            ->whereColumn('chat_message_id', 'chat_messages.id')));
    }

    private function messageQuery(ChatRoom $room, bool $actionsEnabled, User $actor, bool $phaseTwo): Builder
    {
        return ChatMessage::query()->where('chat_room_id', $room->id)
            ->with('employee:id,full_name,employee_code,avatar_path')
            ->when($actionsEnabled, fn ($query) => $query->with(['replyTo' => fn ($reply) => $this->withoutHidden($reply->getQuery(), $actor, $phaseTwo)
                ->where('chat_room_id', $room->id)->with('employee:id,full_name')]));
    }

    public function findMessage(User $actor, int $id): array
    {
        $room = $this->room($actor);
        abort_unless($room && Schema::hasTable('chat_message_actions'), 404);
        $phaseTwo = Schema::hasTable('chat_message_user_states');
        $message = $this->withoutHidden($this->messageQuery($room, true, $actor, $phaseTwo), $actor, $phaseTwo)
            ->findOrFail($id);
        return $this->serialize($message, $actor, $phaseTwo && $this->translationConfigured());
    }

    public function downloadAttachment(User $actor, int $id, int $slot): StreamedResponse
    {
        $room = $this->room($actor);
        abort_unless($room, 404);
        $query = ChatMessage::query()->where('chat_room_id', $room->id);
        $message = $this->withoutHidden($query, $actor, Schema::hasTable('chat_message_user_states'))->findOrFail($id);
        $attachment = $message->attachments[$slot - 1] ?? null;
        abort_if($message->recalled_at || ! $attachment, 404);

        $disk = Storage::disk('local');
        abort_unless($disk->exists($attachment['path']), 404);

        return $disk->download($attachment['path'], $attachment['name'], [
            'Content-Type' => $attachment['mime_type'],
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function pins(User $actor): array
    {
        $room = $this->room($actor);
        if (! $room || ! Schema::hasTable('chat_message_actions')) {
            return [];
        }
        $phaseTwo = Schema::hasTable('chat_message_user_states');
        return $this->withoutHidden($this->messageQuery($room, true, $actor, $phaseTwo), $actor, $phaseTwo)
            ->with('pinnedBy:id,name')->whereNotNull('pinned_at')->whereNull('recalled_at')
            ->orderByDesc('pinned_at')->orderByDesc('id')->limit(self::MAX_PINS)
            ->get()->map(fn ($message) => $this->serialize($message, $actor))->all();
    }

    public function messageAction(User $actor, int $id, string $action): array
    {
        $room = $this->room($actor);
        abort_unless($room && Schema::hasTable('chat_message_actions'), 404);
        abort_unless(in_array($action, ['recall', 'pin', 'unpin', 'hide', 'retry'], true), 404);
        $phaseTwo = Schema::hasTable('chat_message_user_states');
        abort_if(in_array($action, ['hide', 'retry'], true) && ! $phaseTwo, 404);

        return DB::transaction(function () use ($room, $actor, $id, $action, $phaseTwo): array {
            // Serialize room actions so the event cursor follows commit order.
            ChatRoom::query()->lockForUpdate()->findOrFail($room->id);
            $message = ChatMessage::query()->where('chat_room_id', $room->id)->lockForUpdate()->findOrFail($id);
            $time = now();
            if ($phaseTwo && $this->hidden($actor, $id)) {
                abort_unless($action === 'hide', 404);
                return ['chat_message_id' => $id, 'action' => 'hide', 'created_at' => $time->toISOString()];
            }
            if ($action === 'hide') {
                $state = ChatReadState::query()->where('chat_room_id', $room->id)->where('user_id', $actor->id)->lockForUpdate()->first();
                $wasRead = (int) $state?->last_visible_read_message_id >= $id
                    || (Schema::hasTable('chat_message_views') && DB::table('chat_message_views')
                        ->where('user_id', $actor->id)->where('chat_message_id', $id)->exists());
                DB::table('chat_message_user_states')->insert(['user_id' => $actor->id, 'chat_message_id' => $id,
                    'hidden_at' => $time, 'read_before_hide' => $wasRead]);
                return $this->recordMessageAction($room, $actor, $id, $action, $time);
            }
            if ($action === 'retry') {
                abort_unless((int) $message->user_id === (int) $actor->id, 403);
                abort_unless($message->recalled_at === null && $message->translation_status === 'failed' && $this->translationConfigured(), 409);
                abort_if($message->translation_attempt > 0 && DB::table('chat_message_actions')
                    ->where('id', $message->translation_attempt)->where('created_at', '>', $time->copy()->subSeconds(30))->exists(), 429);
                $event = $this->recordMessageAction($room, $actor, $id, $action, $time);
                $message->markTranslationRequested($actor->id, 'ja-vi');
                $message->forceFill(['translation_status' => 'pending', 'translation_provider' => 'gemini',
                    'translation_error_category' => null, 'translation_attempt' => $event['id']])->save();
                $this->enqueueTranslation($id, $event['id']);
                return $event;
            }
            if ($action === 'recall') {
                abort_unless((int) $message->user_id === (int) $actor->id, 403);
                if ($message->recalled_at !== null) {
                    return ['chat_message_id' => $id, 'action' => $action, 'created_at' => $message->recalled_at->toISOString()];
                }
                $message->recalled_at = $time;
                if ($phaseTwo) $message->recalled_by = $actor->id;
            } else {
                abort_if($message->recalled_at !== null, 409, '取り消されたメッセージはピン留めできません。');
                if (($message->pinned_at !== null) === ($action === 'pin')) {
                    return ['chat_message_id' => $id, 'action' => $action, 'created_at' => $message->pinned_at?->toISOString()];
                }
                if ($action === 'pin') {
                    abort_if(ChatMessage::query()->where('chat_room_id', $room->id)->whereNotNull('pinned_at')
                        ->whereNull('recalled_at')->count() >= self::MAX_PINS, 409, 'ピン留めできる件数の上限に達しました。');
                }
            }
            $message->pinned_at = $action === 'pin' ? $time : null;
            $message->pinned_by = $action === 'pin' ? $actor->id : null;
            $message->save();
            return $this->recordMessageAction($room, $actor, $id, $action, $time);
        }, 3);
    }

    private function recordMessageAction(ChatRoom $room, User $actor, int $id, string $action, \Illuminate\Support\Carbon $time): array
    {
        $eventId = DB::table('chat_message_actions')->insertGetId([
            'chat_room_id' => $room->id, 'chat_message_id' => $id,
            'actor_user_id' => $actor->id, 'action' => $action, 'created_at' => $time,
        ]);
        return ['id' => $eventId, 'chat_message_id' => $id, 'action' => $action, 'created_at' => $time->toISOString()];
    }

    public function unreadCount(User $actor): int
    {
        return $this->unreadSummary($actor)['unread_count'];
    }

    public function unreadSummary(User $actor): array
    {
        $room = $this->room($actor);
        return $room ? $this->unreadSummaryForRoom($actor, $room) : ['unread_count' => 0, 'first_unread_id' => null];
    }

    /** @return array{read_cursor: int, acknowledged_ids: list<int>} */
    public function markRead(User $actor, int $messageId, array $visibleIds = []): array
    {
        return $this->advanceCursor($actor, $messageId, true, $visibleIds ?: [$messageId]);
    }

    public function markDelivered(User $actor, int $messageId): void
    {
        $this->advanceCursor($actor, $messageId, false);
    }

    private function advanceCursor(User $actor, int $messageId, bool $read, array $visibleIds = []): array
    {
        $room = $this->room($actor);
        abort_unless($room, 404);
        $deliveryEnabled = $this->receiptsAvailable();
        $actionsEnabled = $read && Schema::hasTable('chat_message_actions');
        $phaseTwo = $actionsEnabled && Schema::hasTable('chat_message_user_states');
        $trackViews = $read && Schema::hasTable('chat_message_views');
        abort_if(! $read && ! $deliveryEnabled, 409);
        ChatMessage::query()->where('chat_room_id', $room->id)->findOrFail($messageId, ['id']);

        return DB::transaction(function () use ($room, $actor, $messageId, $read, $deliveryEnabled, $visibleIds, $actionsEnabled, $phaseTwo, $trackViews) {
            $key = ['chat_room_id' => $room->id, 'user_id' => $actor->id];
            ChatReadState::query()->firstOrCreate($key);
            $state = ChatReadState::query()->where($key)->lockForUpdate()->firstOrFail();
            if ($read) {
                $readCursor = (int) ($deliveryEnabled ? $state->last_visible_read_message_id : $state->last_read_message_id);
                if ($messageId <= $readCursor) {
                    return ['read_cursor' => $readCursor, 'acknowledged_ids' => []];
                }
                abort_if($deliveryEnabled && $messageId > (int) $state->last_delivered_message_id, 409);
                $incoming = $this->withoutHidden(ChatMessage::query(), $actor, $phaseTwo)->where('chat_room_id', $room->id)
                    ->where('user_id', '!=', $actor->id)->where('id', '>', $readCursor)
                    ->when($actionsEnabled, fn ($query) => $query->whereNull('recalled_at'));
                $visible = array_fill_keys($visibleIds, true);
                $acknowledgedIds = [];
                if ($trackViews) {
                    // Record only observed messages and keep the cursor as a compact read prefix.
                    $acknowledgedIds = (clone $incoming)->where('id', '<=', $messageId)
                        ->whereIn('id', $visibleIds)->pluck('id')->map(fn ($id) => (int) $id)->all();
                    if ($acknowledgedIds !== []) {
                        DB::table('chat_message_views')->insertOrIgnore(array_map(fn ($id) => [
                            'chat_message_id' => $id, 'user_id' => $actor->id,
                        ], $acknowledgedIds));
                    }
                }
                $confirmed = $readCursor;
                $prefix = $incoming->when(! $trackViews, fn ($query) => $query->where('id', '<=', $messageId))
                    ->orderBy('id')->limit(50)->pluck('id');
                if ($trackViews) {
                    $visible = DB::table('chat_message_views')->where('user_id', $actor->id)
                        ->whereIn('chat_message_id', $prefix)->pluck('chat_message_id')->flip()->all();
                }
                foreach ($prefix as $id) {
                    if (! isset($visible[$id])) {
                        break;
                    }
                    $confirmed = (int) $id;
                }
                if ($confirmed === $readCursor) {
                    return ['read_cursor' => $readCursor, 'acknowledged_ids' => $acknowledgedIds];
                }
                // Older clients advanced unread state even without visibility evidence.
                if ($deliveryEnabled) {
                    $state->last_visible_read_message_id = $confirmed;
                }
                $state->last_read_message_id = max((int) $state->last_read_message_id, $confirmed);
                $state->read_at = now();
                $state->save();
                if ($trackViews && $deliveryEnabled) {
                    DB::table('chat_message_views')->where('user_id', $actor->id)
                        ->whereIn('chat_message_id', $prefix->filter(fn ($id) => $id <= $confirmed))->delete();
                }

                return ['read_cursor' => $confirmed, 'acknowledged_ids' => $acknowledgedIds];
            }
            if ($messageId > (int) $state->last_delivered_message_id) {
                $state->last_delivered_message_id = $messageId;
                $state->save();
            }

            return [];
        }, 3);
    }

    private function unreadSummaryForRoom(User $actor, ChatRoom $room, ?bool $actionsEnabled = null, ?bool $phaseTwo = null): array
    {
        $lastRead = ChatReadState::query()->where('chat_room_id', $room->id)
            ->where('user_id', $actor->id)->selectRaw('COALESCE(MAX(last_read_message_id), 0)');
        $summary = $this->withoutHidden(ChatMessage::query(), $actor, $phaseTwo ?? Schema::hasTable('chat_message_user_states'))
            ->where('chat_room_id', $room->id)->where('id', '>', $lastRead)
            ->when($actionsEnabled ?? Schema::hasTable('chat_message_actions'), fn ($query) => $query->whereNull('recalled_at'))
            ->when(Schema::hasTable('chat_message_views'), fn ($query) => $query->whereNotExists(fn ($view) => $view
                ->selectRaw('1')->from('chat_message_views')->where('user_id', $actor->id)
                ->whereColumn('chat_message_id', 'chat_messages.id')))
            ->where('user_id', '!=', $actor->id)
            ->toBase()->selectRaw('COUNT(*) AS unread_count, MIN(id) AS first_unread_id')->first();

        return [
            'unread_count' => (int) $summary->unread_count,
            'first_unread_id' => $summary->first_unread_id === null ? null : (int) $summary->first_unread_id,
        ];
    }

    private function translationPayload(ChatMessage $message, User $actor): array
    {
        $showLegacy = $message->recalled_at === null && $message->translationRequestedBy($actor->id, 'ja-vi');
        $identity = $message->translation_provider === 'identity';
        $showOriginal = $message->recalled_at === null;

        return [
            'japanese_content' => $showOriginal && ($showLegacy || $identity || $message->source_language === 'ja')
                ? $message->japanese_content : null,
            'vietnamese_content' => $showOriginal && ($showLegacy || $identity || $message->source_language === 'vi')
                ? $message->vietnamese_content : null,
            'translation_status' => $showLegacy || $identity ? $message->translation_status : 'pending',
            'translation_error_category' => $showLegacy ? $message->translation_error_category : null,
            'translation_provider' => $showLegacy || $identity ? $message->translation_provider : 'pending',
            'translation_attempt' => $showLegacy ? ($message->translation_attempt ?? 0) : 0,
            'translations' => $message->translationsFor($actor->id),
        ];
    }

    /** @return array<string,mixed> */
    private function serialize(ChatMessage $message, User $actor, bool $canRetryTranslation = false): array
    {
        $recalled = $message->recalled_at !== null;
        $reply = $message->relationLoaded('replyTo') ? $message->replyTo : null;
        return [
            'id' => $message->id,
            'client_message_id' => $message->client_message_id,
            'sender' => [
                'id' => $message->employee_id,
                'name' => $message->employee?->full_name ?? '社員',
                'employee_code' => $message->employee?->employee_code,
                'avatar_path' => $message->employee?->avatar_path,
            ],
            'is_mine' => (int) $message->user_id === (int) $actor->id,
            'can_recall' => ! $recalled && (int) $message->user_id === (int) $actor->id,
            'can_retry_translation' => ! $recalled && $canRetryTranslation && (int) $message->user_id === (int) $actor->id,
            'original_text' => $recalled ? '' : $message->original_text,
            'mentions' => $recalled ? [] : ($message->mentions ?? []),
            'attachments' => $recalled ? [] : array_map(
                fn (array $file, int $index) => ['id' => $index + 1, ...\Illuminate\Support\Arr::only($file, ['name', 'size', 'mime_type'])],
                $message->attachments ?? [], array_keys($message->attachments ?? []),
            ),
            'source_language' => $message->source_language,
            ...$this->translationPayload($message, $actor),
            'created_at' => $message->created_at?->toISOString(),
            'recalled_at' => $message->recalled_at?->toISOString(),
            'pinned_at' => $message->pinned_at?->toISOString(),
            'pinned_by_name' => $message->relationLoaded('pinnedBy') ? $message->pinnedBy?->name : null,
            'reply_to' => ! $recalled && $reply ? [
                'id' => $reply->id,
                'sender_name' => $reply->employee?->full_name ?? '社員',
                'excerpt' => $reply->recalled_at ? null : Str::limit(Str::squish($reply->original_text) ?: '添付ファイル', 96),
            ] : null,
        ];
    }
}
