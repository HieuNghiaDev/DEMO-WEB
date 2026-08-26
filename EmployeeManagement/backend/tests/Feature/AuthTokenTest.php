<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_attendance_api_rejects_unauthenticated_requests(): void
    {
        $attendance = Attendance::create([
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 09:00:00',
            'status' => 'working',
        ]);

        $this->getJson('/api/attendances/active')
            ->assertUnauthorized();

        $this->postJson('/api/attendances/start', [
            'employee_name' => 'LE HIEU NGHIA',
        ])->assertUnauthorized();

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'offline',
        ])->assertUnauthorized();
    }

    public function test_employee_can_login_use_the_api_and_logout_with_a_token(): void
    {
        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);

        $employee = Employee::create([
            'employee_code' => 'TM003',
            'full_name' => 'NGUYEN THI MAI',
            'full_name_kana' => 'グエン・ティ・マイ',
            'gender' => 'female',
            'hire_date' => '2026-08-12',
            'office_id' => $office->id,
            'avatar_path' => '/images/girl.png',
            'status' => 'active',
        ]);

        User::create([
            'employee_id' => $employee->id,
            'login_id' => 'TM003',
            'name' => $employee->full_name,
            'email' => 'mai@themis.local',
            'password' => 'Themis@123456',
            'role' => 'employee',
            'is_active' => true,
            'must_change_password' => false,
        ]);

        $loginResponse = $this
            ->withHeader('Origin', 'http://localhost:5173')
            ->postJson('/api/login', [
                'email' => 'mai@themis.local',
                'password' => 'Themis@123456',
                'remember' => true,
            ]);

        $loginResponse
            ->assertOk()
            ->assertJsonPath('user.email', 'mai@themis.local')
            ->assertJsonPath('user.employee.employee_code', 'TM003')
            ->assertJsonPath('user.employee.gender', 'female')
            ->assertJsonStructure(['token']);

        $token = $loginResponse->json('token');

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.employee.full_name_kana', 'グエン・ティ・マイ');

        $this->withToken($token)
            ->postJson('/api/logout')
            ->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertUnauthorized();
    }
}
