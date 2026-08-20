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
            EmployeeUserSeeder::class,
            AdditionalEmployeeUserSeeder::class,
            PersonaSeeder::class,
            RolePermissionSeeder::class,
        ]);

        if (app()->environment('local')) {
            $this->call(ManagerTestUserSeeder::class);
        }
    }
}
