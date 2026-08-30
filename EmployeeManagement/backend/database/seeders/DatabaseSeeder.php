<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            OfficeSeeder::class,
            PersonaSeeder::class,
            RolePermissionSeeder::class,
            CaseTypeSeeder::class,
            CaseWorkspaceTemplateSeeder::class,
        ]);

        if (app()->environment(['local', 'testing'])) {
            $this->call([
                EmployeeUserSeeder::class,
                AdditionalEmployeeUserSeeder::class,
            ]);
        }

        if (app()->environment('local')) {
            $this->call(ManagerTestUserSeeder::class);
            $this->call(CaseWorkspaceDemoSeeder::class);
        }
    }
}
