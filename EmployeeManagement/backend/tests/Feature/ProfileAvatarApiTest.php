<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileAvatarApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_employee_can_replace_only_their_own_avatar(): void
    {
        Storage::fake('public');

        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);
        $employee = Employee::create([
            'employee_code' => 'TM101',
            'full_name' => 'LE HIEU NGHIA',
            'gender' => 'male',
            'hire_date' => '2026-09-10',
            'office_id' => $office->id,
            'avatar_path' => '/images/boy.png',
            'status' => 'active',
        ]);
        $user = User::factory()->create([
            'employee_id' => $employee->id,
            'must_change_password' => false,
        ]);

        Sanctum::actingAs($user);

        $this->post('/api/me/avatar', [
            'avatar' => UploadedFile::fake()->image('profile.png', 320, 320),
        ])
            ->assertOk()
            ->assertJsonPath('message', 'プロフィール画像を更新しました。')
            ->assertJsonPath('user.employee.id', $employee->id);

        $employee->refresh();

        $this->assertStringStartsWith('/storage/avatars/', $employee->avatar_path);
        Storage::disk('public')->assertExists(substr($employee->avatar_path, strlen('/storage/')));
    }

    public function test_avatar_upload_rejects_unsupported_files(): void
    {
        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);
        $employee = Employee::create([
            'employee_code' => 'TM102',
            'full_name' => 'THAN VAN SAY',
            'gender' => 'male',
            'hire_date' => '2026-09-10',
            'office_id' => $office->id,
            'status' => 'active',
        ]);
        $user = User::factory()->create([
            'employee_id' => $employee->id,
            'must_change_password' => false,
        ]);

        Sanctum::actingAs($user);

        $this->post('/api/me/avatar', [
            'avatar' => UploadedFile::fake()->create('profile.pdf', 20, 'application/pdf'),
        ])->assertUnprocessable()->assertJsonValidationErrors('avatar');
    }
}
