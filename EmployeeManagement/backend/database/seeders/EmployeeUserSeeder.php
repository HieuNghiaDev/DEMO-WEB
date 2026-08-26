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
        if (! app()->environment(['local', 'testing'])) {
            $this->command?->warn('EmployeeUserSeeder is restricted to local/testing environments.');

            return;
        }

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
                'position_title' => 'アルバイト',
                'employment_type' => 'part_time',
                'work_email' => 'nghialezsm@gmail.com',
                'phone' => null,
                'avatar_path' => '/images/boy.png',
                'status' => 'active',
            ]
        );

        $user = User::firstOrNew([
            'login_id' => 'TM001',
        ]);

        $user->fill([
            'employee_id' => $employee->id,
            'name' => $employee->full_name,
            'email' => 'nghialezsm@gmail.com',
            'role' => 'employee',
            'is_active' => true,
        ]);

        if (! $user->exists) {
            $user->password = Hash::make('Themis@123456');
            $user->must_change_password = true;
        }

        $user->save();
    }
}
