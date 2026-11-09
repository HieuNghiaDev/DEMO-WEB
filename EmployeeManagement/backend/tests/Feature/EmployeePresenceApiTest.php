<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeePresenceApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_authenticated_heartbeat_updates_the_current_token_last_used_time(): void
    {
        $user = $this->makeUser('PRS-001', 'level_2');
        $plainTextToken = $user->createToken('presence-test')->plainTextToken;
        $token = $user->tokens()->sole();

        $this->assertNull($token->last_used_at);

        $this->withToken($plainTextToken)
            ->postJson('/api/presence/heartbeat')
            ->assertNoContent();

        $this->assertNotNull($token->fresh()->last_used_at);
    }

    public function test_organization_reports_recent_tokens_as_online_and_stale_tokens_as_offline(): void
    {
        $manager = $this->makeUser('PRS-002', 'level_4');
        $onlineUser = $this->makeUser('PRS-003', 'level_2');
        $offlineUser = $this->makeUser('PRS-004', 'level_2');

        $onlineUser->createToken('online-browser');
        $onlineUser->tokens()->sole()->forceFill(['last_used_at' => now()])->save();
        $offlineUser->createToken('closed-browser');
        $offlineUser->tokens()->sole()->forceFill(['last_used_at' => now()->subMinutes(3)])->save();

        $this->assertSame(
            0,
            $offlineUser->tokens()->where('last_used_at', '>=', now()->subSeconds(90))->count()
        );

        Sanctum::actingAs($manager);
        $employees = collect($this->getJson('/api/organization')->assertOk()->json('employees'))
            ->keyBy('employee_code');

        $this->assertSame('online', $employees['PRS-003']['presence_status']);
        $this->assertSame('online', $employees['PRS-003']['work_status']);
        $this->assertSame('offline', $employees['PRS-004']['presence_status']);
        $this->assertSame('offline', $employees['PRS-004']['work_status']);
    }

    private function makeUser(string $employeeCode, string $roleName): User
    {
        $office = Office::query()->firstOrCreate(
            ['office_code' => 'PRESENCE'],
            ['name' => 'Presence Test Office', 'status' => 'active']
        );
        $employee = Employee::query()->create([
            'employee_code' => $employeeCode,
            'full_name' => $employeeCode,
            'hire_date' => now()->toDateString(),
            'office_id' => $office->id,
            'status' => 'active',
        ]);
        $user = User::factory()->create([
            'employee_id' => $employee->id,
            'login_id' => strtolower($employeeCode),
            'must_change_password' => false,
        ]);
        $user->roles()->sync([Role::query()->where('name', $roleName)->value('id')]);

        return $user;
    }
}
