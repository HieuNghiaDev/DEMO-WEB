<?php

namespace App\Models\Relations;

use App\Services\Administration\AdminContinuityGuard;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** All standard pivot mutators, including their OrFail/WithoutDetaching variants, share the guard. */
class AdministrativeBelongsToMany extends BelongsToMany
{
    public function sync($ids, $detaching = true)
    {
        return app(AdminContinuityGuard::class)->run(fn () => parent::sync($ids, $detaching), $this->parent, 'administration.pivot_sync');
    }

    public function attach($ids, array $attributes = [], $touch = true)
    {
        return app(AdminContinuityGuard::class)->run(fn () => parent::attach($ids, $attributes, $touch), $this->parent, 'administration.pivot_attach');
    }

    public function detach($ids = null, $touch = true)
    {
        return app(AdminContinuityGuard::class)->run(fn () => parent::detach($ids, $touch), $this->parent, 'administration.pivot_detach');
    }

    public function toggle($ids, $touch = true)
    {
        return app(AdminContinuityGuard::class)->run(fn () => parent::toggle($ids, $touch), $this->parent, 'administration.pivot_toggle');
    }

    public function updateExistingPivot($id, array $attributes, $touch = true)
    {
        return app(AdminContinuityGuard::class)->run(fn () => parent::updateExistingPivot($id, $attributes, $touch), $this->parent, 'administration.pivot_update');
    }
}
