<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Office;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_attendance_includes_the_employee_display_profile(): void
    {
        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);

        Employee::create([
            'employee_code' => 'TM003',
            'full_name' => 'NGUYEN THI MAI',
            'full_name_kana' => 'グエン・ティ・マイ',
            'gender' => 'female',
            'hire_date' => '2026-08-12',
            'office_id' => $office->id,
            'avatar_path' => '/images/girl.png',
            'status' => 'active',
        ]);

        Attendance::create([
            'employee_name' => 'NGUYEN THI MAI',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 09:59:00',
            'status' => 'working',
        ]);

        $this->getJson('/api/attendances/active')
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath(
                'attendances.0.employee.full_name_kana',
                'グエン・ティ・マイ'
            )
            ->assertJsonPath('attendances.0.employee.employee_code', 'TM003')
            ->assertJsonPath('attendances.0.employee.full_name', 'NGUYEN THI MAI')
            ->assertJsonPath('attendances.0.employee.gender', 'female')
            ->assertJsonPath('attendances.0.employee.avatar_path', '/images/girl.png');
    }
}
