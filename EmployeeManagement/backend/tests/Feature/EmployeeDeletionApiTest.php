<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\ChatMessage;
use App\Models\ChatRoom;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeDeletionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_level_four_can_delete_a_regular_employee_account(): void
    {
        $manager = $this->makeUser('DEL-001', 'level_4');
        $target = $this->makeUser('DEL-002', 'level_2');
        $target->createToken('deletion-test');

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$target->employee_id}")
            ->assertOk()
            ->assertJsonPath('message', '社員を削除しました。');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_active' => false]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_type' => User::class,
            'tokenable_id' => $target->id,
        ]);
        $this->assertSoftDeleted('employees', ['id' => $target->employee_id]);
        $this->assertDatabaseHas('employees', [
            'id' => $target->employee_id,
            'status' => 'resigned',
        ]);
        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'auth.account.deleted_by_manager',
            'outcome' => 'success',
            'user_id' => $manager->id,
        ]);
    }

    public function test_level_two_cannot_delete_an_employee_account(): void
    {
        $employee = $this->makeUser('DEL-003', 'level_2');
        $target = $this->makeUser('DEL-004', 'level_2');

        Sanctum::actingAs($employee);
        $this->deleteJson("/api/employees/{$target->employee_id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $target->id]);
        $this->assertNotSoftDeleted('employees', ['id' => $target->employee_id]);
    }

    public function test_employee_with_chat_history_can_be_removed_and_old_token_is_rejected(): void
    {
        $manager = $this->makeUser('DEL-012', 'level_4');
        $target = $this->makeUser('DEL-013', 'level_2');
        $token = $target->createToken('deletion-test')->plainTextToken;
        DB::table('sessions')->insert([
            'id' => 'employee-removal-session', 'user_id' => $target->id, 'payload' => 'synthetic', 'last_activity' => now()->timestamp,
        ]);
        $room = ChatRoom::create([
            'office_id' => $target->employee->office_id, 'kind' => 'general',
            'name' => 'THEMIS_GENERAL', 'singleton_slot' => 1,
        ]);
        $message = ChatMessage::create([
            'chat_room_id' => $room->id, 'user_id' => $target->id, 'employee_id' => $target->employee_id,
            'client_message_id' => (string) Str::uuid(), 'source_language' => 'ja',
            'original_text' => 'Synthetic retained message',
        ]);

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$target->employee_id}")
            ->assertOk()->assertJsonPath('message', '社員を削除しました。');
        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_active' => false]);
        $this->assertDatabaseMissing('sessions', ['id' => 'employee-removal-session']);
        $this->assertSoftDeleted('employees', ['id' => $target->employee_id]);
        $this->getJson('/api/organization')->assertOk()->assertJsonMissing(['employee_code' => 'DEL-013']);
        $this->getJson("/api/internal-chat/messages/{$message->id}")->assertOk()
            ->assertJsonPath('message.original_text', 'Synthetic retained message')
            ->assertJsonPath('message.sender.name', 'DEL-013');
        $this->assertDatabaseHas('chat_messages', ['id' => $message->id, 'user_id' => $target->id]);
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_database_failure_rolls_back_removal_and_returns_a_safe_message(): void
    {
        $manager = $this->makeUser('DEL-014', 'level_4');
        $target = $this->makeUser('DEL-015', 'level_2');
        $token = $target->createToken('deletion-test')->accessToken;
        Employee::deleting(fn () => DB::table('synthetic_missing_table')->count());

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$target->employee_id}")->assertStatus(500)->assertExactJson([
            'message' => '社員を削除できませんでした。時間をおいて再試行してください。',
        ]);
        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_active' => true]);
        $this->assertDatabaseHas('employees', ['id' => $target->employee_id, 'status' => 'active']);
        $this->assertNotSoftDeleted('employees', ['id' => $target->employee_id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $token->id]);
        $this->assertDatabaseMissing('security_audit_logs', ['event' => 'administration.employee_deleted', 'outcome' => 'success']);
    }

    public function test_level_four_can_delete_a_legacy_employee_without_a_login_account(): void
    {
        $manager = $this->makeUser('DEL-010', 'level_4');
        $legacyEmployee = Employee::query()->create([
            'employee_code' => 'DEL-011',
            'full_name' => 'LEGACY EMPLOYEE',
            'hire_date' => now()->toDateString(),
            'office_id' => $manager->employee->office_id,
            'status' => 'active',
        ]);

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$legacyEmployee->id}")
            ->assertOk()
            ->assertJsonPath('message', '社員を削除しました。');

        $this->assertSoftDeleted('employees', ['id' => $legacyEmployee->id]);
        $this->assertDatabaseHas('employees', [
            'id' => $legacyEmployee->id,
            'status' => 'resigned',
        ]);
    }

    public function test_manager_cannot_delete_their_own_account(): void
    {
        $manager = $this->makeUser('DEL-005', 'level_4');

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$manager->employee_id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $manager->id]);
        $this->assertNotSoftDeleted('employees', ['id' => $manager->employee_id]);
    }

    public function test_level_four_cannot_delete_a_level_five_account(): void
    {
        $manager = $this->makeUser('DEL-006', 'level_4');
        $superAdmin = $this->makeUser('DEL-007', 'level_5');

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$superAdmin->employee_id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $superAdmin->id]);
        $this->assertNotSoftDeleted('employees', ['id' => $superAdmin->employee_id]);
    }

    public function test_level_five_can_delete_another_level_five_when_one_remains(): void
    {
        $actor = $this->makeUser('DEL-008', 'level_5');
        $target = $this->makeUser('DEL-009', 'level_5');

        Sanctum::actingAs($actor);
        $this->deleteJson("/api/employees/{$target->employee_id}")->assertOk();

        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_active' => false]);
        $this->assertDatabaseHas('users', ['id' => $actor->id, 'is_active' => true]);
    }

    private function makeUser(string $employeeCode, string $roleName): User
    {
        $office = Office::query()->firstOrCreate(
            ['office_code' => 'DELETE_TEST'],
            ['name' => 'Delete Test Office', 'status' => 'active']
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
            'role' => match ($roleName) {
                'level_5' => 'admin',
                'level_4' => 'manager',
                default => 'employee',
            },
            'must_change_password' => false,
        ]);
        $user->roles()->sync([Role::query()->where('name', $roleName)->value('id')]);

        return $user;
    }
}
