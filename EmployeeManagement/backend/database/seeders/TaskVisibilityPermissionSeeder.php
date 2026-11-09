<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class TaskVisibilityPermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Runtime grants/revocations belong to the organization's audited configuration.
        Permission::firstOrCreate(['name' => 'task.view_all'], ['display_name' => '全業務を閲覧']);
    }
}
