<?php

use App\Models\Permission;
use App\Models\Role;
use App\Services\Administration\AdminContinuityGuard;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $staff = Role::query()->where('name', 'staff')->first();
        if ($staff === null) {
            // Future role installations use the updated MainRoles baseline.
            return;
        }

        $permission = Permission::query()->where('name', 'employee.create')->sole();
        if ($staff->permissions()->whereKey($permission->id)->exists()) {
            return;
        }

        app(AdminContinuityGuard::class)->run(
            fn () => $staff->permissions()->syncWithoutDetaching([$permission->id]),
            $staff,
            'administration.staff_employee_create_granted',
            null,
            true,
        );
    }

    public function down(): void
    {
        // Revoke through a separate audited policy change so rollback preserves pre-existing grants.
    }
};
