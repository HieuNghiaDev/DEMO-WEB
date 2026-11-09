<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model
{
    use \App\Models\Concerns\GuardsAdminContinuity;
    protected $fillable = [
        'name',
        'display_name',
    ];

    public function roles(): BelongsToMany
    {
        $related = new Role;
        return new \App\Models\Relations\AdministrativeBelongsToMany($related->newQuery(), $this, 'role_permissions', 'permission_id', 'role_id', 'id', 'id', 'roles');
    }
}
