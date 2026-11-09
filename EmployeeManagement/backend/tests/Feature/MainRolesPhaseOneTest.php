<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\CaseType;
use App\Models\DocumentType;
use App\Models\EmployeeTask;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use App\Services\Administration\MainRoles;
use App\Services\Administration\Totp;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class MainRolesPhaseOneTest extends B21TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        MainRoles::install();
    }

    public static function roles(): array
    {
        return array_combine(MainRoles::NAMES, array_map(fn ($name) => [$name], MainRoles::NAMES));
    }

    private function account(string $role, string $label = 'subject'): User
    {
        $user = $this->fixtureUser("p1-{$role}-{$label}", []);
        // Fixture only. The application grants the first admin through the guarded local operation.
        DB::table('user_roles')->where('user_id', $user->id)->delete();
        DB::table('user_roles')->insert(['user_id' => $user->id, 'role_id' => $this->role($role)->id]);
        return $user->fresh();
    }

    private function role(string $role): Role
    {
        return Role::where('name', $role)->sole();
    }

    private function loginAs(User $user, bool $mfa): ?string
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $login = ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD];
        $response = $this->postJson('/api/login', $login);
        $secret = null;
        if ($mfa) {
            $challenge = $response->assertStatus(202)->assertJsonMissingPath('token')->json('challenge');
            $secret = $this->postJson('/api/mfa/enrollment/start', compact('challenge'))->assertOk()->json('secret');
            $totp = app(Totp::class);
            $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge,
                'otp' => $totp->code($secret, now()->timestamp)])->assertOk();
            $challenge = $this->postJson('/api/login', $login)->assertStatus(202)->json('challenge');
            $this->travel(31)->seconds();
            $response = $this->postJson('/api/mfa/login', ['challenge' => $challenge,
                'otp' => $totp->code($secret, now()->timestamp)]);
        }
        $token = $response->assertOk()->assertJsonPath('user.id', $user->id)->json('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($token);
        return $secret;
    }

    #[DataProvider('roles')]
    public function test_role_login_and_operational_boundaries(string $role): void
    {
        $actor = $this->account($role);
        $partTime = $role === 'part_time';
        $professional = in_array($role, ['admin', 'lawyer', 'legal_assistant'], true);
        $canClose = in_array($role, ['admin', 'lawyer'], true);
        $canManageRoles = in_array($role, ['admin', 'legal_assistant', 'staff'], true);
        $case = $this->matter();
        $case->forceFill(['is_confidential' => false, 'reference_number' => 'C-001'])->save();
        $other = $this->matter();
        $other->forceFill(['is_confidential' => false])->save();
        $caseType = CaseType::create(['name' => 'Synthetic P1', 'is_active' => true]);
        $this->loginAs($actor, $canManageRoles);

        $this->getJson('/api/me')->assertOk()->assertJsonPath('user.role_names', [$role]);
        $this->getJson('/api/attendances/my-timeline')->assertOk();
        $this->getJson('/api/internal-chat/messages')->assertOk();
        $this->getJson('/api/notifications/center')->assertOk();
        $this->getJson('/api/my/tasks')->assertOk();
        $ownTask = EmployeeTask::create(['employee_id' => $actor->employee_id, 'title' => 'Assigned task',
            'assigned_by' => $actor->id, 'duration_minutes' => 30, 'status' => 'in_progress']);
        $this->patchJson("/api/tasks/{$ownTask->id}/status", ['status' => 'completed'])->assertOk()
            ->assertJsonPath('task.status', 'completed');
        $this->assertSame($canManageRoles, $actor->hasPermission('employee.manage_roles'));
        $this->assertSame($role === 'admin', $actor->hasPermission('settings.manage'));

        $this->getJson("/api/case-files/{$case->id}")->assertStatus($partTime ? 404 : 200);
        if ($partTime) {
            DB::table('case_memberships')->insert([
                'case_file_id' => $case->id, 'user_id' => $actor->id, 'employee_id' => $actor->employee_id,
                'can_read' => true, 'can_write' => true, 'can_read_confidential' => false,
                'expires_at' => now()->addDay(),
            ]);
            $this->getJson("/api/case-files/{$case->id}")->assertOk();
            $this->getJson("/api/case-files/{$other->id}")->assertNotFound();
            $this->getJson('/api/visa-progress')->assertForbidden();
        }
        $this->postJson('/api/case-files', ['classification' => 'normal', 'title' => 'Synthetic new case',
            'client_id' => $case->client_id, 'case_type_id' => $caseType->id])->assertStatus($partTime ? 403 : 201);
        $this->putJson("/api/case-files/{$case->id}", ['title' => 'Synthetic edited case'])->assertStatus($partTime ? 403 : 200);
        $this->putJson("/api/case-files/{$case->id}", ['status' => 'closed'])->assertStatus($canClose ? 200 : 403);
        $this->getJson("/api/case-files/{$case->id}/documents")->assertOk();
        $this->postJson("/api/case-files/{$case->id}/documents", ['title' => 'Synthetic document', 'category' => 'required',
            'file_url' => 'https://example.test/synthetic.pdf'])->assertStatus($professional ? 201 : 403);
        $document = $case->documents()->create(['title' => 'Existing document', 'category' => 'required',
            'assigned_employee_id' => $actor->employee_id]);
        $this->patchJson("/api/case-files/{$case->id}/documents/{$document->id}", ['title' => 'Updated document'])
            ->assertStatus($professional ? 200 : 403);
        Storage::fake('local');
        $this->post("/api/case-files/{$case->id}/document-collection/{$document->id}/received-documents", [
            'title' => 'Uploaded document', 'storage_type' => 'upload',
            'file' => UploadedFile::fake()->createWithContent('evidence.pdf', "%PDF-1.4\n% Synthetic evidence\n%%EOF"),
        ], ['Accept' => 'application/json'])->assertStatus($professional ? 201 : 403);
        $this->postJson("/api/case-files/{$case->id}/case-tasks", ['title' => 'Synthetic task'])
            ->assertStatus($professional ? 201 : 403);
        $approval = ApprovalRequest::create(['action_type' => 'ordinary_review', 'status' => 'pending',
            'payload' => ['case_file_id' => $case->id]]);
        $this->patchJson("/api/approvals/{$approval->id}/approve")->assertStatus($professional ? 200 : 403);
        $this->getJson("/api/case-files/{$case->id}/interpretation-requests")->assertStatus($professional ? 200 : 403);
        $this->postJson('/api/ai/chat', [])->assertStatus($partTime ? 403 : 422);
    }

    public function test_manager_can_map_an_account_with_exact_mfa_and_preserve_specialist_grants(): void
    {
        $admin = $this->account('admin');
        $target = $this->fixtureLegacy('p1-unmapped', 'level_2', 'employee');
        $specialist = Role::create(['name' => 'interpretation_coordinator_local', 'display_name' => 'Coordinator']);
        $target->roles()->attach($specialist->id);
        $secret = $this->loginAs($admin, true);
        $options = $this->getJson('/api/organization')->assertOk()->json('available_roles');
        $this->assertSame(MainRoles::NAMES, array_column($options, 'name'));
        $url = "/api/employees/{$target->employee_id}/roles";
        $staff = $this->role('staff');
        $this->putJson($url, ['role_ids' => [$staff->id]])->assertForbidden();
        $this->travel(31)->seconds();
        $this->postJson('/api/mfa/step-up', ['action' => 'role.assign',
            'scope' => ['user_id' => $target->id, 'role_id' => $staff->id],
            'password' => self::SYNTHETIC_PASSWORD, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk();
        $this->putJson($url, ['role_ids' => [$staff->id]])->assertOk();
        $this->assertEqualsCanonicalizing(['staff', 'interpretation_coordinator_local'], $target->fresh()->role_names);
        $this->putJson($url, ['role_ids' => [$staff->id]])->assertForbidden();
        $this->putJson($url, ['role_ids' => [$this->role('admin')->id]])->assertForbidden();
        $this->postJson('/api/mfa/step-up', ['action' => 'legal.c001.final_approve',
            'scope' => [], 'password' => self::SYNTHETIC_PASSWORD, 'otp' => '000000'])->assertForbidden();
    }

    public function test_staff_can_map_a_lower_account_but_cannot_use_the_proof_to_promote_it(): void
    {
        $staff = $this->account('staff');
        $target = $this->fixtureLegacy('p1-junior', 'level_1', 'part_time');
        $secret = $this->loginAs($staff, true);
        $url = "/api/employees/{$target->employee_id}/roles";
        $partTime = $this->role('part_time');
        $this->travel(31)->seconds();
        $this->postJson('/api/mfa/step-up', ['action' => 'role.assign',
            'scope' => ['user_id' => $target->id, 'role_id' => $partTime->id],
            'password' => self::SYNTHETIC_PASSWORD, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk();
        $this->putJson($url, ['role_ids' => [$this->role('lawyer')->id]])->assertForbidden();
        $this->putJson($url, ['role_ids' => [$partTime->id]])->assertOk();
        $this->assertSame(['part_time'], $target->fresh()->role_names);
    }

    public function test_legal_assistant_can_assign_only_lower_roles_to_colleagues_in_the_same_office(): void
    {
        $assistant = $this->account('legal_assistant');
        $colleague = $this->fixtureLegacy('p1-assistant-colleague', 'level_1');
        $external = $this->fixtureLegacy('p1-assistant-other-office', 'level_1');
        $otherOffice = Office::create(['office_code' => 'P1-OTHER', 'name' => 'Synthetic other office', 'status' => 'active']);
        $external->employee->update(['office_id' => $otherOffice->id]);
        $secret = $this->loginAs($assistant, true);
        $role = $this->role('staff');
        $url = "/api/employees/{$colleague->employee_id}/roles";

        $this->putJson("/api/employees/{$assistant->employee_id}/roles", ['role_ids' => [$role->id]])->assertForbidden();
        $this->putJson("/api/employees/{$external->employee_id}/roles", ['role_ids' => [$role->id]])->assertForbidden();
        $this->putJson($url, ['role_ids' => [$this->role('lawyer')->id]])->assertForbidden();
        $this->assertSame(['level_1'], $external->fresh()->role_names);

        foreach ([$role, $this->role('part_time')] as $lowerRole) {
            $this->travel(31)->seconds();
            $this->postJson('/api/mfa/step-up', ['action' => 'role.assign',
                'scope' => ['user_id' => $colleague->id, 'role_id' => $lowerRole->id],
                'password' => self::SYNTHETIC_PASSWORD, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk();
            $this->putJson($url, ['role_ids' => [$lowerRole->id]])->assertOk();
            $this->assertSame([$lowerRole->name], $colleague->fresh()->role_names);
        }
    }

    public function test_case_reference_and_document_type_do_not_change_approval_authorization(): void
    {
        $lawyer = $this->account('lawyer');
        $this->loginAs($lawyer, false);
        foreach (['C-001', 'X-P1'] as $code) {
            $case = $this->matter();
            $case->forceFill(['reference_number' => $code, 'is_confidential' => false])->save();
            $type = DocumentType::create(['code' => $code, 'name_ja' => 'Synthetic', 'document_group' => 'C', 'handling_type' => 'office_generated']);
            $document = $case->documents()->create(['title' => 'Synthetic', 'category' => 'required', 'document_type_id' => $type->id]);
            $url = "/api/case-files/{$case->id}/document-collection/{$document->id}/creation";
            $this->postJson($url.'/approve')->assertForbidden();
            $this->postJson($url.'/reject')->assertForbidden();
            $this->postJson($url.'/c001/final-decisions')->assertNotFound();
            $case->forceFill(['is_confidential' => true])->save();
            $this->getJson("/api/case-files/{$case->id}")->assertNotFound();
        }
    }
}
