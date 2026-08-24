<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalRequest;
use App\Models\SecretaryLog;
use App\Models\Task;
use App\Models\User;
use App\Services\ApprovalGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

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

    public function execute(
        Request $request,
        ApprovalRequest $approval,
        ApprovalGuard $approvalGuard,
    ): JsonResponse {
        $actor = $request->user();

        if ($approval->action_type !== 'delete_task' || $approval->tool_name !== 'delete_task') {
            return $this->executionError(
                $approval,
                $actor,
                422,
                'この承認申請の操作は実行対象外です。',
            );
        }

        try {
            $approvalGuard->assertApproved('delete_task', $approval->id);
        } catch (RuntimeException) {
            return $this->executionError(
                $approval,
                $actor,
                409,
                '承認済みの申請のみ実行できます。',
            );
        }

        $taskId = $approval->payload['task_id'] ?? null;

        if (! is_int($taskId) || $taskId < 1) {
            return $this->executionError(
                $approval,
                $actor,
                422,
                '承認済みペイロードに有効な task_id がありません。',
            );
        }

        return DB::transaction(function () use ($approval, $actor, $taskId): JsonResponse {
            $lockedApproval = ApprovalRequest::query()
                ->lockForUpdate()
                ->findOrFail($approval->id);

            if ($lockedApproval->executed_at !== null) {
                return $this->executionError(
                    $lockedApproval,
                    $actor,
                    409,
                    'この承認申請はすでに実行済みです。',
                    $taskId,
                );
            }

            if ($lockedApproval->status !== 'approved') {
                return $this->executionError(
                    $lockedApproval,
                    $actor,
                    409,
                    '承認済みの申請のみ実行できます。',
                    $taskId,
                );
            }

            if ($lockedApproval->action_type !== 'delete_task'
                || $lockedApproval->tool_name !== 'delete_task'
                || ($lockedApproval->payload['task_id'] ?? null) !== $taskId) {
                return $this->executionError(
                    $lockedApproval,
                    $actor,
                    422,
                    '承認内容が一致しないため実行できません。',
                    $taskId,
                );
            }

            $task = Task::query()->lockForUpdate()->find($taskId);

            if ($task === null) {
                return $this->executionError(
                    $lockedApproval,
                    $actor,
                    404,
                    "Task [{$taskId}] was not found.",
                    $taskId,
                );
            }

            $deletedTask = [
                'id' => $task->id,
                'title' => $task->title,
            ];

            $task->delete();
            $lockedApproval->update([
                'executed_by' => $actor->id,
                'executed_at' => now(),
            ]);

            $output = [
                'approval_id' => $lockedApproval->id,
                'action_type' => 'delete_task',
                'task_id' => $taskId,
                'deleted_task' => $deletedTask,
            ];
            $this->logExecution($lockedApproval, $actor, $taskId, 'success', $output);

            return response()->json([
                'message' => '承認済みのタスク削除を実行しました。',
                'approval' => $this->serialize($lockedApproval->load([
                    'requestedBy', 'approvedBy', 'rejectedBy', 'executedBy',
                ])),
                'execution' => $output,
            ]);
        });
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

    private function executionError(
        ApprovalRequest $approval,
        User $actor,
        int $statusCode,
        string $message,
        ?int $taskId = null,
    ): JsonResponse {
        $this->logExecution($approval, $actor, $taskId, 'failed', [
            'message' => $message,
            'http_status' => $statusCode,
        ]);

        return response()->json(['message' => $message], $statusCode);
    }

    /** @param array<string, mixed> $output */
    private function logExecution(
        ApprovalRequest $approval,
        User $actor,
        ?int $taskId,
        string $status,
        array $output,
    ): void {
        SecretaryLog::create([
            'skill_name' => 'task_management',
            'trigger_type' => 'approval_execution',
            'input' => [
                'approval_id' => $approval->id,
                'action_type' => $approval->action_type,
                'task_id' => $taskId,
                'triggered_by' => $actor->id,
            ],
            'output' => $output,
            'status' => $status,
        ]);
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
