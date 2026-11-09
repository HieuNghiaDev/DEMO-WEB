<?php

namespace Tests\Feature\HostingG2;

use App\Models\{Permission, Role};
use App\Services\Administration\{AdministrativeRoleService, Totp};
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\{Crypt, DB};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class ProtectedLegalRoleTest extends B21TestCase
{
    public static function subjects(): array { return [['permission'], ['protected_role']]; }

    #[DataProvider('subjects')]
    public function test_legacy_manager_cannot_replace_a_protected_legal_subject(string $kind): void
    {
        $manager = $this->fixtureUser('legacy-manager', ['employee.manage_roles'], 'level_5');
        $lawyer = $this->fixtureUser('lawyer', $kind === 'permission' ? ['document.approve_legal'] : [], $kind === 'protected_role' ? 'verified_lawyer' : null);
        $ordinary = $this->fixtureEmployee('ordinary');
        $before = $lawyer->roles()->pluck('roles.id')->all();
        $this->actingAs($manager)->putJson('/api/employees/'.$lawyer->employee_id.'/roles', ['role_ids' => [$ordinary->roles()->sole()->id]])->assertForbidden();
        $this->assertSame($before, $lawyer->roles()->pluck('roles.id')->all());
    }

    public static function roleOperations(): array { return [['assign'], ['permissions'], ['delete']]; }

    #[DataProvider('roleOperations')]
    public function test_fresh_admin_step_up_does_not_authorize_ordinary_removal_of_legal_authority(string $operation): void
    {
        $admin = $this->fixtureAdmin();
        $lawyer = $this->fixtureUser('protected-lawyer', ['document.approve_legal']);
        $ordinary = $this->fixtureEmployee('ordinary'); $role = $lawyer->roles()->sole();
        $scope = match ($operation) {
            'assign' => ['user_id' => $lawyer->id, 'role_id' => $ordinary->roles()->sole()->id],
            'permissions' => ['role_id' => $role->id, 'permissions' => ['task.update']],
            'delete' => ['role_id' => $role->id],
        };
        $this->actingAs($admin); $this->travel(31)->seconds();
        $secret = Crypt::decryptString(DB::table('account_mfa')->where('user_id', $admin->id)->value('secret_ciphertext'));
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($secret, now()->timestamp), 'action' => 'role.'.$operation, 'scope' => $scope])->assertOk();
        $before = DB::table('role_permissions')->orderBy('role_id')->orderBy('permission_id')->get()->toJson();
        try {
            $service = app(AdministrativeRoleService::class);
            match ($operation) {
                'assign' => $service->assign($admin, $lawyer, $ordinary->roles()->sole()),
                'permissions' => $service->replacePermissions($admin, $role, ['task.update']),
                'delete' => $service->delete($admin, $role),
            };
            $this->fail('Ordinary privileged role editor must not remove legal authority.');
        } catch (AuthorizationException) {}
        $this->assertSame($before, DB::table('role_permissions')->orderBy('role_id')->orderBy('permission_id')->get()->toJson());
        $this->assertTrue($lawyer->fresh()->hasPermission('document.approve_legal'));
    }
}
