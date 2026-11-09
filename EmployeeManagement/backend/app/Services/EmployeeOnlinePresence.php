<?php

namespace App\Services;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

final class EmployeeOnlinePresence
{
    public static function userIds(): array
    {
        $now = now();

        return PersonalAccessToken::query()
            ->where('tokenable_type', (new User)->getMorphClass())
            ->where('last_used_at', '>=', $now->copy()->subSeconds(90))
            ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', $now))
            ->distinct()->pluck('tokenable_id')->mapWithKeys(fn ($id) => [(int) $id => true])->all();
    }
}
