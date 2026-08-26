<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/** Creates a predictable manager account for local development only. */
class ManagerTestUserSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local')) {
            $this->command?->warn('ManagerTestUserSeeder is restricted to the local environment.');

            return;
        }

        $office = Office::query()
            ->where('office_code', 'THEMIS')
            ->firstOrFail();

        $employee = Employee::updateOrCreate(
            ['employee_code' => 'TM-MGR001'],
            [
                'full_name' => 'THEMIS MANAGER',
                'full_name_kana' => 'テミス・マネージャー',
                'gender' => null,
                'nationality_code' => 'JP',
                'date_of_birth' => null,
                'hire_date' => now()->toDateString(),
                'termination_date' => null,
                'office_id' => $office->id,
                'department_id' => null,
                'position_title' => 'マネージャー',
                'employment_type' => 'full_time',
                'work_email' => 'manager@themis.local',
                'phone' => null,
                'avatar_path' => null,
                'status' => 'active',
            ]
        );

        User::updateOrCreate(
            ['login_id' => 'TM-MGR001'],
            [
                'employee_id' => $employee->id,
                'name' => $employee->full_name,
                'email' => 'manager@themis.local',
                'password' => Hash::make('Themis@123456'),
                'role' => 'manager',
                'is_active' => true,
                'must_change_password' => false,
            ]
        );
    }
}
