<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\User;
use App\Services\InterpretationLocalActivation;
use App\Services\SecurityAuditLogger;
use Illuminate\Support\Facades\DB;
use LogicException;
use Mockery;
use Tests\Support\B21\B21TestCase;

class InterpretationLocalActivationTest extends B21TestCase
{
    private const HASH = 'f38e128d34ec7da51b22d7db92c171aa331d91b920aeeae8e63a5efc130a1e09';

    protected function setUp(): void
    {
        parent::setUp();
        while ((int) User::max('id') < 10) {
            $this->fixtureUser('activation-'.((int) User::max('id') + 1), ['case.view']);
        }
        DB::table('users')->whereIn('id', [7, 9])->update(['employee_id' => null]);
        DB::table('users')->where('id', 8)->update(['employee_id' => 7, 'is_active' => true]);
        DB::table('users')->where('id', 10)->update(['employee_id' => 9, 'is_active' => true]);
        DB::table('employees')->whereIn('id', [7, 9])->update(['status' => 'active']);
        foreach ([...InterpretationLocalActivation::PERMISSIONS, 'interpretation.view_costs'] as $name) {
            Permission::firstOrCreate(['name' => $name], ['display_name' => 'Synthetic '.$name]);
        }
    }

    public function test_exact_additive_grant_preserves_existing_roles_credentials_and_protected_capabilities(): void
    {
        $beforeRoles = DB::table('user_roles')->whereIn('user_id', [8, 10])->orderBy('user_id')->orderBy('role_id')->get()->toJson();
        $beforeUsers = DB::table('users')->whereIn('id', [8, 10])->orderBy('id')->get()->toJson();

        $result = app(InterpretationLocalActivation::class)->apply(
            'INTERPRETATION-P1-LOCAL-20261101', str_repeat('a', 64), self::HASH
        );

        $this->assertSame('APPLIED', $result['status']);
        $this->assertTrue($result['existing_roles_preserved']);
        $this->assertFalse($result['view_costs_granted']);
        $roleId = DB::table('roles')->where('name', InterpretationLocalActivation::ROLE)->value('id');
        $this->assertSame(2, DB::table('user_roles')->where('role_id', $roleId)->count());
        $this->assertSame(6, DB::table('role_permissions')->where('role_id', $roleId)->count());
        $this->assertFalse(DB::table('role_permissions')->where('role_id', $roleId)
            ->where('permission_id', Permission::where('name', 'interpretation.view_costs')->value('id'))->exists());
        $this->assertSame($beforeRoles, DB::table('user_roles')->whereIn('user_id', [8, 10])->where('role_id', '<>', $roleId)
            ->orderBy('user_id')->orderBy('role_id')->get()->toJson());
        $this->assertSame($beforeUsers, DB::table('users')->whereIn('id', [8, 10])->orderBy('id')->get()->toJson());
        $this->assertDatabaseCount('security_audit_logs', 3);
        foreach ([8, 10] as $userId) {
            foreach (InterpretationLocalActivation::PERMISSIONS as $permission) {
                $this->assertTrue(User::findOrFail($userId)->hasPermission($permission));
            }
            $this->assertFalse(User::findOrFail($userId)->hasPermission('interpretation.view_costs'));
        }
    }

    public function test_replay_role_collision_and_unapproved_evidence_fail_without_delta(): void
    {
        $service = app(InterpretationLocalActivation::class);
        $service->apply('INTERPRETATION-P1-LOCAL-20261101', str_repeat('b', 64), self::HASH);
        $before = DB::table('user_roles')->orderBy('user_id')->orderBy('role_id')->get()->toJson();
        try {
            $service->apply('INTERPRETATION-P1-LOCAL-20261101', str_repeat('b', 64), self::HASH);
            $this->fail('Replay must fail closed.');
        } catch (LogicException $error) {
            $this->assertStringContainsString('already exists', $error->getMessage());
        }
        $this->assertSame($before, DB::table('user_roles')->orderBy('user_id')->orderBy('role_id')->get()->toJson());
        $this->expectException(LogicException::class);
        $service->apply('WRONG', str_repeat('b', 64), self::HASH);
    }

    public function test_required_audit_failure_rolls_back_role_permissions_and_assignments(): void
    {
        $logger = Mockery::mock(SecurityAuditLogger::class);
        $logger->shouldReceive('recordRequired')->once()->andThrow(new \RuntimeException('Synthetic audit failure'));
        $this->app->instance(SecurityAuditLogger::class, $logger);

        try {
            app(InterpretationLocalActivation::class)->apply(
                'INTERPRETATION-P1-LOCAL-20261101', str_repeat('c', 64), self::HASH
            );
            $this->fail('Audit failure must abort activation.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Synthetic audit failure', $error->getMessage());
        }
        $this->assertDatabaseMissing('roles', ['name' => InterpretationLocalActivation::ROLE]);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }
}
