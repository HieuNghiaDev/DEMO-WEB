<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use RuntimeException;

class ApprovalGuard
{
    public function assertApproved(string $actionType, int $approvalId): ApprovalRequest
    {
        $approval = ApprovalRequest::find($approvalId);

        if ($approval === null) {
            throw new RuntimeException("Approval request [{$approvalId}] was not found.");
        }

        if ($approval->action_type !== $actionType) {
            throw new RuntimeException("Approval request [{$approvalId}] does not authorize action [{$actionType}].");
        }

        if ($approval->status !== 'approved') {
            throw new RuntimeException("Approval request [{$approvalId}] is not approved.");
        }

        return $approval;
    }
}
