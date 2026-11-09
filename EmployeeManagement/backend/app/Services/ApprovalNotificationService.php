<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\EmployeeNotification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ApprovalNotificationService
{
    public function notifyDecision(ApprovalRequest $approval): void
    {
        $requester = $approval->requestedBy;
        if (! $requester?->is_active || ! $requester->hasPermission('approval.view')
            || ($requester->employee_id !== null && $requester->employee?->status !== 'active')
            || ! app(ApprovalContextAccess::class)->allows($approval, $requester)) {
            return;
        }

        EmployeeNotification::query()->create([
            'user_id' => $requester->id,
            'kind' => $approval->status === 'approved' ? 'success' : 'warning',
            'title' => $approval->status === 'approved' ? '申請が承認されました' : '申請が却下されました',
            'message' => "承認申請 REQ-#{$approval->id}",
            'data' => ['notification_type' => 'approval_decision', 'approval_id' => $approval->id, 'target_path' => '/approvals'],
        ]);
    }

    public function notify(ApprovalRequest $approval): int
    {
        return DB::transaction(function () use ($approval): int {
            $lockedApproval = ApprovalRequest::query()
                ->with('requestedBy:id,name')
                ->lockForUpdate()
                ->findOrFail($approval->id);

            $recipients = User::query()
                ->where('is_active', true)
                ->whereHas('roles.permissions', fn (Builder $permissionQuery) => $permissionQuery
                    ->where('name', 'approval.approve'))
                ->get();

            $createdCount = 0;

            foreach ($recipients as $recipient) {
                if (! $recipient->hasPermission('approval.approve')
                    || ($recipient->employee_id !== null && $recipient->employee?->status !== 'active')
                    || ! app(ApprovalContextAccess::class)->allows($lockedApproval, $recipient)) {
                    continue;
                }
                $alreadyExists = EmployeeNotification::query()
                    ->where('user_id', $recipient->id)
                    ->where('data->notification_type', 'approval_request')
                    ->where('data->approval_id', $lockedApproval->id)
                    ->exists();

                if ($alreadyExists) {
                    continue;
                }

                EmployeeNotification::query()->create([
                    'user_id' => $recipient->id,
                    'kind' => 'warning',
                    'title' => '承認待ちの申請があります',
                    'message' => $this->messageFor($lockedApproval),
                    'data' => [
                        'notification_type' => 'approval_request',
                        'approval_id' => $lockedApproval->id,
                        'action_type' => $lockedApproval->action_type,
                        'requester_id' => $lockedApproval->requested_by,
                        'target_path' => '/approvals',
                    ],
                ]);

                $createdCount++;
            }

            return $createdCount;
        });
    }

    private function messageFor(ApprovalRequest $approval): string
    {
        $action = $approval->action_type === 'delete_task'
            ? 'タスク削除'
            : $approval->action_type;
        $requester = $approval->requestedBy?->name;
        $requesterText = $requester ? " 申請者: {$requester}。" : '';

        return "{$action}の承認申請 #{$approval->id} があります。{$requesterText}";
    }
}
