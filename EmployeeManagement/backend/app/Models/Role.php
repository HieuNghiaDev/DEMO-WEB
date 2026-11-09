<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use \App\Models\Concerns\GuardsAdminContinuity;
    protected $fillable = [
        'name',
        'display_name',
    ];

    public function users(): BelongsToMany
    {
        $related = new User;
        return new \App\Models\Relations\AdministrativeBelongsToMany($related->newQuery(), $this, 'user_roles', 'role_id', 'user_id', 'id', 'id', 'users');
    }

    public function permissions(): BelongsToMany
    {
        $related = new Permission;
        return new \App\Models\Relations\AdministrativeBelongsToMany($related->newQuery(), $this, 'role_permissions', 'role_id', 'permission_id', 'id', 'id', 'permissions');
    }
}
