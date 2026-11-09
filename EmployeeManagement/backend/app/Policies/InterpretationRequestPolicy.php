<?php

namespace App\Policies;

use App\Models\CaseFile;
use App\Models\InterpretationRequest;
use App\Models\User;
use App\Services\CaseAccessService;

class InterpretationRequestPolicy
{
    public function capability(User $user, CaseFile $case, string $action): bool
    {
        return $user->exists && $user->is_active && $user->employee?->status === 'active'
            && $user->hasPermission('case.view') && $user->hasPermission('interpretation.view')
            && ($action === 'view' || $user->hasPermission('interpretation.'.$action))
            && CaseAccessService::contentAllows($user, $case->id, $action === 'view' || $action === 'view_costs' ? 'read' : 'write');
    }

    public function viewAny(User $user, CaseFile $case): bool { return $this->capability($user, $case, 'view'); }
    public function create(User $user, CaseFile $case): bool { return $this->capability($user, $case, 'create'); }
    public function assignAny(User $user, CaseFile $case): bool { return $this->capability($user, $case, 'assign'); }
    public function view(User $user, InterpretationRequest $item): bool { return $this->capability($user, $item->caseFile, 'view'); }
    public function update(User $user, InterpretationRequest $item): bool { return $this->capability($user, $item->caseFile, 'update'); }
    public function assign(User $user, InterpretationRequest $item): bool { return $this->capability($user, $item->caseFile, 'assign'); }
    public function transition(User $user, InterpretationRequest $item): bool { return $this->capability($user, $item->caseFile, 'transition'); }
    public function cancel(User $user, InterpretationRequest $item): bool { return $this->capability($user, $item->caseFile, 'cancel'); }
}
