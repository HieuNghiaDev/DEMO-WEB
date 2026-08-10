<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class EmployeeUserSeeder extends Seeder
{
    public function run(): void
    {
        $office = Office::query()
            ->where('office_code', 'THEMIS')
            ->firstOrFail();

        $employee = Employee::updateOrCreate(
            [
                'employee_code' => 'TM001',
            ],
            [
                'full_name' => 'LE HIEU NGHIA',
                'full_name_kana' => 'レ・ヒエウ・ギア',
                'gender' => 'male',
                'nationality_code' => 'VN',
                'date_of_birth' => null,
                'hire_date' => now()->toDateString(),
                'termination_date' => null,
                'office_id' => $office->id,
                'department_id' => null,
                'position_title' => '社員',
                'employment_type' => 'full_time',
                'work_email' => 'nghia@themis.local',
                'phone' => null,
                'avatar_path' => '/images/boy.png',
                'status' => 'active',
            ]
        );

        User::firstOrCreate(
            [
                'login_id' => 'TM001',
            ],
            [
                'employee_id' => $employee->id,
                'name' => $employee->full_name,
                'email' => 'nghia@themis.local',
                'password' => Hash::make('Themis@123456'),
                'role' => 'employee',
                'is_active' => true,
                'must_change_password' => true,
            ]
        );
    }
}