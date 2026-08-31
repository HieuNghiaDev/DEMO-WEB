<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ApprovalRequestController extends Controller
{
    public function index(): JsonResponse
    {
        $approvals = ApprovalRequest::query()
            ->with(['requestedBy', 'approvedBy', 'rejectedBy', 'executedBy'])
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->latest()
            ->limit(100)
            ->get()
            ->map(fn (ApprovalRequest $approval): array => $this->serialize($approval));

        return response()->json(['approvals' => $approvals]);
    }

    public function approve(Request $request, ApprovalRequest $approval): JsonResponse
    {
        return $this->transition($approval, 'approved', $request->user());
    }

    public function reject(Request $request, ApprovalRequest $approval): JsonResponse
    {
        return $this->transition($approval, 'rejected', $request->user());
    }

    public function execute(Request $request, ApprovalRequest $approval): JsonResponse
    {
        // A stale approval must never be interpreted as a canonical case task.
        return response()->json([
            'message' => '旧タスク操作の実行はV2移行により停止しています。',
            'code' => 'legacy_execution_unavailable',
        ], 410);
    }

    private function transition(ApprovalRequest $approval, string $status, User $actor): JsonResponse
    {
        $result = DB::transaction(function () use ($approval, $status, $actor): array {
            $lockedApproval = ApprovalRequest::query()
                ->lockForUpdate()
                ->findOrFail($approval->id);

            if ($lockedApproval->status !== 'pending') {
                return [
                    'error' => true,
                    'status' => $lockedApproval->status,
                ];
            }

            $lockedApproval->update($status === 'approved'
                ? [
                    'status' => 'approved',
                    'approved_by' => $actor->id,
                    'approved_at' => now(),
                ]
                : [
                    'status' => 'rejected',
                    'rejected_by' => $actor->id,
                    'rejected_at' => now(),
                ]);

            return [
                'error' => false,
                'approval' => $lockedApproval->load(['requestedBy', 'approvedBy', 'rejectedBy', 'executedBy']),
            ];
        });

        if ($result['error']) {
            return response()->json([
                'message' => '処理済みの承認申請は変更できません。',
                'current_status' => $result['status'],
            ], 409);
        }

        return response()->json([
            'approval' => $this->serialize($result['approval']),
        ]);
    }

    /** @return array<string, mixed> */
    private function serialize(ApprovalRequest $approval): array
    {
        return [
            'id' => $approval->id,
            'action_type' => $approval->action_type,
            'tool_name' => $approval->tool_name,
            'payload' => $approval->payload,
            'requested_by' => $this->serializeUser($approval->requestedBy),
            'status' => $approval->status,
            'created_at' => $approval->created_at?->toISOString(),
            'approved_by' => $this->serializeUser($approval->approvedBy),
            'approved_at' => $approval->approved_at?->toISOString(),
            'rejected_by' => $this->serializeUser($approval->rejectedBy),
            'rejected_at' => $approval->rejected_at?->toISOString(),
            'executed_by' => $this->serializeUser($approval->executedBy),
            'executed_at' => $approval->executed_at?->toISOString(),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private function serializeUser(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => $user->id,
            'name' => (string) ($user->name ?: $user->email),
        ];
    }
}
