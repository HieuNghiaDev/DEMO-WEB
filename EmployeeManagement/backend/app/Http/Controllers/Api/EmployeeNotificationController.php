<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmployeeNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = EmployeeNotification::query()
            ->where('user_id', $request->user()->id)
            ->latest('id')
            ->limit(50)
            ->get()
            ->map(fn (EmployeeNotification $notification) => $this->transform($notification));

        return response()->json([
            'notifications' => $notifications,
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
        EmployeeNotification::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

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
        ];
    }
}
