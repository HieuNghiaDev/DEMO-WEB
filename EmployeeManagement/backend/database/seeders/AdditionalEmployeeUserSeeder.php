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
        $offices = Office::query()
            ->whereIn('office_code', ['THEMIS', 'CHUKA_LAW'])
            ->get()
            ->keyBy('office_code');

        if (! $offices->has('THEMIS') || ! $offices->has('CHUKA_LAW')) {
            throw new \RuntimeException('Required offices have not been seeded.');
        }

        $employees = [
            [
                'employee_code' => 'TM002',
                'full_name' => 'THAN VAN SAY',
                'full_name_kana' => 'タンバンサイ',
                'gender' => 'male',
                'nationality_code' => 'VN',
                'office_code' => 'THEMIS',
                'work_email' => 'thanvansay@gmail.com',
                'avatar_path' => '/images/boy.png',
            ],
            [
                'employee_code' => 'TM003',
                'full_name' => 'TRINH THI THU HUONG',
                'full_name_kana' => 'チン・ティ・トゥ・フオン',
                'gender' => 'female',
                'nationality_code' => 'VN',
                'office_code' => 'THEMIS',
                'work_email' => 'trinhhuong888888@gmail.com',
                'avatar_path' => '/images/girl.png',
            ],
            [
                'employee_code' => 'TM004',
                'full_name' => 'VU THI NGOC BICH',
                'full_name_kana' => 'ヴー・ティ・ゴック・ビック',
                'gender' => 'female',
                'nationality_code' => 'VN',
                'office_code' => 'THEMIS',
                'work_email' => 'coltdthemis@gmail.com',
                'avatar_path' => '/images/girl.png',
            ],
            [
                'employee_code' => 'LW001',
                'full_name' => '中峯',
                'full_name_kana' => 'ナカミネ',
                'gender' => 'female',
                'nationality_code' => 'JP',
                'office_code' => 'CHUKA_LAW',
                'work_email' => 'syuri0622syunisan@docomo.ne.jp',
                'avatar_path' => '/images/girl.png',
            ],
            [
                'employee_code' => 'LW002',
                'full_name' => '中峯　将文',
                'full_name_kana' => 'ナカミネ・マサフミ',
                'gender' => 'male',
                'nationality_code' => 'JP',
                'office_code' => 'CHUKA_LAW',
                'work_email' => 'nakaminelaw-jimu@basil.ocn.ne.jp',
                'avatar_path' => '/images/boy.png',
            ],
        ];

        DB::transaction(function () use ($employees, $offices): void {
            foreach ($employees as $employeeData) {
                $employee = Employee::updateOrCreate(
                    [
                        'employee_code' => $employeeData['employee_code'],
                    ],
                    [
                        'full_name' => $employeeData['full_name'],
                        'full_name_kana' => $employeeData['full_name_kana'],
                        'gender' => $employeeData['gender'],
                        'nationality_code' => $employeeData['nationality_code'],
                        'date_of_birth' => null,
                        'hire_date' => '2026-08-12',
                        'termination_date' => null,
                        'office_id' => $offices[$employeeData['office_code']]->id,
                        'department_id' => null,
                        'position_title' => null,
                        'employment_type' => 'full_time',
                        'work_email' => $employeeData['work_email'],
                        'phone' => null,
                        'avatar_path' => $employeeData['avatar_path'],
                        'status' => 'active',
                    ]
                );

                $user = User::firstOrNew([
                    'login_id' => $employeeData['employee_code'],
                ]);

                $user->fill([
                    'employee_id' => $employee->id,
                    'name' => $employee->full_name,
                    'email' => $employeeData['work_email'],
                    'role' => 'employee',
                    'is_active' => true,
                ]);

                if (! $user->exists) {
                    $user->password = Hash::make('Themis@123456');
                    $user->must_change_password = true;
                }

                $user->save();
            }
        });
    }
}
