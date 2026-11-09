<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmployeeNotification;
use App\Services\CaseNotificationAccess;
use App\Services\NotificationTaskSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = EmployeeNotification::query()
            ->where('user_id', $request->user()->id)
            ->latest('id');
        $access = app(CaseNotificationAccess::class);
        $notifications = $query->lazyByIdDesc(100)->chunk(100)
            ->flatMap(fn ($rows) => $access->filter($rows->collect(), $request->user()))->values()->take(50)->collect()
            ->map(fn (EmployeeNotification $notification) => $this->transform($notification));

        return response()->json([
            'notifications' => $notifications,
        ]);
    }

    public function center(Request $request, CaseNotificationAccess $access, NotificationTaskSummary $tasks): JsonResponse
    {
        $input = $request->validate([
            'details' => ['sometimes', 'boolean'],
            'before_id' => ['sometimes', 'integer', 'min:1'],
            'tasks_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $user = $request->user();
        $query = EmployeeNotification::query()->where('user_id', $user->id);
        $visible = fn ($rows) => $access->filter($rows, $user);
        $count = (clone $query)->whereNull('read_at')->select(['id', 'data'])
            ->lazyById(100)->chunk(100)->sum(fn ($rows) => $visible($rows->collect())->count());
        if (! $request->boolean('details')) {
            return response()->json(['unread_count' => $count]);
        }

        $rows = $query->when(isset($input['before_id']), fn ($q) => $q->where('id', '<', $input['before_id']))
            ->lazyByIdDesc(50)->chunk(50)->flatMap(fn ($batch) => $visible($batch->collect()))->values()
            ->take(21)->collect();

        return response()->json([
            'unread_count' => $count,
            'notifications' => $rows->take(20)->map(fn ($notice) => $this->transform($notice))->values(),
            'next_before_id' => $rows->count() > 20 ? $rows->get(19)->id : null,
            'my_tasks_summary' => $tasks->forUser($user, $input['tasks_page'] ?? null),
        ]);
    }

    public function markRead(
        Request $request,
        EmployeeNotification $notification
    ): JsonResponse {
        abort_unless(
            $notification->user_id === $request->user()->id,
            403,
            'この通知を操作する権限がありません。'
        );

        abort_unless(app(\App\Services\CaseNotificationAccess::class)->allows($notification, $request->user()), 404);
        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        $notification->refresh();

        return response()->json([
            'notification' => $this->transform($notification),
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $query = EmployeeNotification::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at');
        $access = app(CaseNotificationAccess::class);
        $readAt = now();
        (clone $query)->select(['id', 'data'])->chunkById(100, function ($rows) use ($query, $access, $request, $readAt): void {
            $ids = $access->filter($rows, $request->user())->pluck('id');
            if ($ids->isNotEmpty()) {
                (clone $query)->whereIn('id', $ids)->update(['read_at' => $readAt]);
            }
        });

        return response()->json([
            'message' => 'すべての通知を既読にしました。',
        ]);
    }

    /** @return array<string, mixed> */
    private function transform(EmployeeNotification $notification): array
    {
        return [
            'id' => $notification->id,
            'kind' => $notification->kind,
            'title' => $notification->title,
            'message' => $notification->message,
            'created_at' => $notification->created_at?->toISOString(),
            'read_at' => $notification->read_at?->toISOString(),
            'assigned_task_id' => $notification->data['assigned_task_id'] ?? null,
            'case_task_id' => $notification->data['case_task_id'] ?? null,
            'case_document_id' => $notification->data['case_document_id'] ?? null,
            'approval_id' => $notification->data['approval_id'] ?? null,
            'action_type' => $notification->data['action_type'] ?? null,
            'target_path' => $notification->data['target_path'] ?? null,
            'chat_message_id' => $notification->data['chat_message_id'] ?? null,
        ];
    }
}
