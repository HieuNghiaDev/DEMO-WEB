<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreChatMessageRequest;
use App\Services\InternalChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InternalChatController extends Controller
{
    public function __construct(private readonly InternalChatService $chat) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'after_id' => ['nullable', 'integer', 'min:1'],
            'before_id' => ['nullable', 'integer', 'min:1'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
            'receipt_ids' => ['sometimes', 'array', 'max:50'],
            'receipt_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            'translation_ids' => ['sometimes', 'array', 'max:50'],
            'translation_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            'after_action_id' => ['sometimes', 'integer', 'min:0'],
        ]);
        abort_if(isset($validated['after_id'], $validated['before_id']), 422, 'after_id と before_id は同時に指定できません。');

        return response()->json($this->chat->messages(
            $request->user(), $validated['after_id'] ?? null, $validated['before_id'] ?? null,
            (int) ($validated['limit'] ?? 20),
            $validated['receipt_ids'] ?? [],
            $validated['translation_ids'] ?? [],
            isset($validated['after_action_id']) ? (int) $validated['after_action_id'] : null,
        ));
    }

    public function store(StoreChatMessageRequest $request): JsonResponse
    {
        $message = $this->chat->send($request->user(), $request->string('text')->toString(),
            $request->string('client_message_id')->toString(), $request->integer('reply_to_message_id') ?: null,
            $request->validated('attachments', []), $request->validated('mentions', []));
        return response()->json(['message' => $message], 201);
    }

    public function pins(Request $request): JsonResponse
    {
        return response()->json(['messages' => $this->chat->pins($request->user())]);
    }

    public function members(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['nullable', 'string', 'max:60']]);
        return response()->json(['members' => $this->chat->mentionCandidates($request->user(), $data['q'] ?? '')]);
    }

    public function show(Request $request, int $message): JsonResponse
    {
        return response()->json(['message' => $this->chat->findMessage($request->user(), $message)]);
    }

    public function downloadAttachment(Request $request, int $message, int $attachment): StreamedResponse
    {
        return $this->chat->downloadAttachment($request->user(), $message, $attachment);
    }

    public function messageAction(Request $request, int $message, string $action): JsonResponse
    {
        $request->validate([
            'actor_user_id' => ['prohibited'], 'user_id' => ['prohibited'],
            'sender_id' => ['prohibited'], 'room_id' => ['prohibited'],
            'chat_room_id' => ['prohibited'], 'chat_message_id' => ['prohibited'],
        ]);

        return response()->json($this->chat->messageAction($request->user(), $message, $action));
    }

    public function unread(Request $request): JsonResponse
    {
        return response()->json(['unread_count' => $this->chat->unreadCount($request->user())]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message_id' => ['required', 'integer', 'min:1'],
            'visible_ids' => ['sometimes', 'array', 'max:50'],
            'visible_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
        ]);
        $read = $this->chat->markRead($request->user(), (int) $validated['message_id'], $validated['visible_ids'] ?? []);

        return response()->json(['unread_count' => $this->chat->unreadCount($request->user()), ...$read]);
    }

    public function markDelivered(Request $request): JsonResponse
    {
        $validated = $request->validate(['message_id' => ['required', 'integer', 'min:1']]);
        $this->chat->markDelivered($request->user(), (int) $validated['message_id']);

        return response()->json(['delivered' => true]);
    }
}
