<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdditionalEmployeeUserSeeder extends Seeder
{
    public function run(): void
    {
        $office = Office::query()
            ->where('office_code', 'THEMIS')
            ->firstOrFail();

        $employees = [
            [
                'employee_code' => 'TM002',
                'full_name' => 'THAN VAN SAY',
                'full_name_kana' => 'タン・ヴァン・サイ',
                'gender' => 'male',
                'work_email' => 'say@themis.local',
                'avatar_path' => '/images/boy.png',
            ],
            [
                'employee_code' => 'TM003',
                'full_name' => 'NGUYEN THI MAI',
                'full_name_kana' => 'グエン・ティ・マイ',
                'gender' => 'female',
                'work_email' => 'mai@themis.local',
                'avatar_path' => '/images/girl.png',
            ],
            [
                'employee_code' => 'TM004',
                'full_name' => 'TRAN THI LAN',
                'full_name_kana' => 'チャン・ティ・ラン',
                'gender' => 'female',
                'work_email' => 'lan@themis.local',
                'avatar_path' => '/images/girl.png',
            ],
        ];

        DB::transaction(function () use ($employees, $office): void {
            foreach ($employees as $employeeData) {
                $employee = Employee::updateOrCreate(
                    [
                        'employee_code' => $employeeData['employee_code'],
                    ],
                    [
                        'full_name' => $employeeData['full_name'],
                        'full_name_kana' => $employeeData['full_name_kana'],
                        'gender' => $employeeData['gender'],
                        'nationality_code' => 'VN',
                        'date_of_birth' => null,
                        'hire_date' => '2026-08-12',
                        'termination_date' => null,
                        'office_id' => $office->id,
                        'department_id' => null,
                        'position_title' => null,
                        'employment_type' => 'full_time',
                        'work_email' => $employeeData['work_email'],
                        'phone' => null,
                        'avatar_path' => $employeeData['avatar_path'],
                        'status' => 'active',
                    ]
                );

                User::firstOrCreate(
                    [
                        'login_id' => $employeeData['employee_code'],
                    ],
                    [
                        'employee_id' => $employee->id,
                        'name' => $employee->full_name,
                        'email' => $employeeData['work_email'],
                        'password' => Hash::make('Themis@123456'),
                        'role' => 'employee',
                        'is_active' => true,
                        'must_change_password' => true,
                    ]
                );
            }
        });
    }
}
