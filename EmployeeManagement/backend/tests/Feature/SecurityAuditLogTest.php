<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\AttendanceExcelService;
use App\Services\SecurityAuditLogger;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityAuditLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolePermissionSeeder::class);
    }

    public function test_failed_login_is_logged_without_plaintext_credentials(): void
    {
        $email = 'unknown@example.com';
        $password = 'DoNotStoreThisPassword';

        $this->postJson('/api/login', [
            'email' => $email,
            'password' => $password,
        ])->assertUnprocessable();

        $auditLog = SecurityAuditLog::query()
            ->where('event', 'auth.login.failed')
            ->firstOrFail();

        $this->assertSame('failure', $auditLog->outcome);
        $this->assertSame('unknown_account', $auditLog->metadata['reason']);
        $this->assertSame(64, strlen($auditLog->identifier_hash));
        $this->assertStringNotContainsString(
            $email,
            $auditLog->toJson()
        );
        $this->assertStringNotContainsString(
            $password,
            $auditLog->toJson()
        );
    }

    public function test_successful_login_and_logout_are_logged(): void
    {
        [$user] = $this->createEmployeeUser();

        $loginResponse = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'StrongTestPassword!123',
            'remember' => false,
        ])->assertOk();

        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'auth.login.succeeded',
            'outcome' => 'success',
            'user_id' => $user->id,
            'employee_id' => $user->employee_id,
        ]);

        $this->withToken($loginResponse->json('token'))
            ->postJson('/api/logout')
            ->assertOk();

        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'auth.logout.succeeded',
            'outcome' => 'success',
            'user_id' => $user->id,
            'employee_id' => $user->employee_id,
        ]);
    }

    public function test_attendance_changes_are_logged_with_the_actor(): void
    {
        [$user, $employee] = $this->createEmployeeUser();

        Sanctum::actingAs($user);

        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->twice();

        $startResponse = $this->postJson('/api/attendances/start')
            ->assertCreated();

        $attendanceId = $startResponse->json('attendance.id');

        $this->patchJson("/api/attendances/{$attendanceId}/status", [
            'status' => 'break',
        ])->assertOk();

        $startedLog = SecurityAuditLog::query()
            ->where('event', 'attendance.started')
            ->firstOrFail();

        $changedLog = SecurityAuditLog::query()
            ->where('event', 'attendance.status.changed')
            ->firstOrFail();

        $this->assertSame($user->id, $startedLog->user_id);
        $this->assertSame($employee->id, $startedLog->employee_id);
        $this->assertSame($attendanceId, $startedLog->metadata['attendance_id']);
        $this->assertSame('working', $changedLog->metadata['from_status']);
        $this->assertSame('break', $changedLog->metadata['to_status']);
    }

    public function test_sensitive_metadata_is_removed_before_persistence(): void
    {
        $request = Request::create('/api/security-test', 'POST');

        app(SecurityAuditLogger::class)->record(
            request: $request,
            event: 'security.test',
            outcome: 'success',
            metadata: [
                'safe_value' => 'visible',
                'password' => 'hidden-password',
                'access_token' => 'hidden-token',
                'nested' => [
                    'authorization_header' => 'hidden-authorization',
                    'safe_nested_value' => 'visible-nested',
                ],
            ]
        );

        $metadata = SecurityAuditLog::firstOrFail()->metadata;

        $this->assertSame('visible', $metadata['safe_value']);
        $this->assertSame('visible-nested', $metadata['nested']['safe_nested_value']);
        $this->assertArrayNotHasKey('password', $metadata);
        $this->assertArrayNotHasKey('access_token', $metadata);
        $this->assertArrayNotHasKey('authorization_header', $metadata['nested']);
    }

    /** @return array{0: User, 1: Employee} */
    private function createEmployeeUser(): array
    {
        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);

        $employee = Employee::create([
            'employee_code' => 'TM001',
            'full_name' => 'LE HIEU NGHIA',
            'gender' => 'male',
            'hire_date' => '2026-08-13',
            'office_id' => $office->id,
            'status' => 'active',
        ]);

        $user = User::factory()->withRole('level_2')->create([
            'employee_id' => $employee->id,
            'login_id' => 'TM001',
            'name' => $employee->full_name,
            'email' => 'nghia@example.com',
            'password' => 'StrongTestPassword!123',
            'role' => 'employee',
            'is_active' => true,
            'must_change_password' => false,
        ]);

        return [$user, $employee];
    }
}
