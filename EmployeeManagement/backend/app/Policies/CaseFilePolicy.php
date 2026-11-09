<?php

namespace App\Policies;

use App\Models\CaseFile;
use App\Models\User;
use App\Services\CaseAccessService;

class CaseFilePolicy
{
    public function view(User $user, CaseFile $case): bool
    {
        return $case->isVisibleTo($user);
    }

    /** Case scope only: route/business functional permissions remain independently mandatory. */
    public function operate(User $user, CaseFile $case): bool
    {
        return CaseAccessService::contentAllows($user, $case->id, 'write');
    }
}
