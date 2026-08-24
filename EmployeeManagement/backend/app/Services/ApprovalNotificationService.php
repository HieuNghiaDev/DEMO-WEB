<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\EmployeeNotification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ApprovalNotificationService
{
    public function notify(ApprovalRequest $approval): int
    {
        return DB::transaction(function () use ($approval): int {
            $lockedApproval = ApprovalRequest::query()
                ->with('requestedBy:id,name')
                ->lockForUpdate()
                ->findOrFail($approval->id);

            $recipients = User::query()
                ->where('is_active', true)
                ->where(function (Builder $query): void {
                    $query
                        ->where('role', 'admin')
                        ->orWhereHas('roles', function (Builder $roleQuery): void {
                            $roleQuery
                                ->where('name', 'level_5')
                                ->orWhereHas('permissions', fn (Builder $permissionQuery) => $permissionQuery
                                    ->where('name', 'approval.approve'));
                        });
                })
                ->get(['id']);

            $createdCount = 0;

            foreach ($recipients as $recipient) {
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
