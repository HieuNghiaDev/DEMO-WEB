<?php

namespace Tests\Feature;

use App\Models\AppRelease;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SecurityAuditLog;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AppReleaseApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolePermissionSeeder::class);
    }

    public function test_authenticated_employee_can_read_the_current_release(): void
    {
        Sanctum::actingAs(User::factory()->withRole('level_2')->create());

        $this->getJson('/api/system/release/current')
            ->assertOk()
            ->assertJsonPath('release.version', '0.11.0')
            ->assertJsonPath('release.codename', 'KAI')
            ->assertJsonMissingPath('release.build_sha');
    }

    public function test_authorized_developer_can_release_and_the_server_calculates_the_version(): void
    {
        $developer = User::factory()->withRole('developer')->create();
        Sanctum::actingAs($developer);

        $this->postJson('/api/developer/releases', [
            'release_type' => 'minor',
            'title' => 'AI社員・UI改善アップデート',
            'release_notes' => [
                'ui' => ['AI社員ページを刷新'],
                'improvements' => ['Footerを改善'],
            ],
            'next_version' => '9.9.9',
        ])->assertCreated()
            ->assertJsonPath('release.version', '0.12.0')
            ->assertJsonPath('release.build_date', '2026-09-25')
            ->assertJsonPath('release.released_by.id', $developer->id);

        $this->assertDatabaseHas('app_releases', [
            'version' => '0.12.0',
            'released_by' => $developer->id,
        ]);

        $audit = SecurityAuditLog::query()->where('event', 'app.release.created')->firstOrFail();
        $this->assertSame('0.11.0', $audit->metadata['previous_version']);
        $this->assertSame('0.12.0', $audit->metadata['new_version']);
    }

    public function test_normal_employee_and_level_five_without_explicit_developer_role_are_forbidden(): void
    {
        foreach (['level_2', 'level_5'] as $roleName) {
            $user = User::factory()->withRole($roleName)->create();
            Sanctum::actingAs($user);

            $this->postJson('/api/developer/releases', $this->validPayload())
                ->assertForbidden();
        }
    }

    public function test_invalid_release_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->withRole('developer')->create());

        $this->postJson('/api/developer/releases', [
            'release_type' => 'manual',
            'title' => '',
            'release_notes' => [],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['release_type', 'title', 'release_notes']);
    }

    public function test_view_only_developer_can_read_history_but_cannot_release(): void
    {
        $viewerRole = Role::query()->create([
            'name' => 'release_observer',
            'display_name' => 'リリース閲覧者',
        ]);
        $viewerRole->permissions()->attach(
            Permission::query()->where('name', 'developer.view')->sole()->id
        );
        $viewer = User::factory()->create();
        $viewer->roles()->attach($viewerRole->id);

        Sanctum::actingAs($viewer);

        $this->getJson('/api/developer/releases')->assertOk();
        $this->postJson('/api/developer/releases', $this->validPayload())->assertForbidden();
    }

    public function test_release_history_is_newest_first_and_requires_developer_access(): void
    {
        AppRelease::query()->create([
            'version' => '0.11.1',
            'major' => 0,
            'minor' => 11,
            'patch' => 1,
            'codename' => 'KAI',
            'release_type' => 'patch',
            'title' => '修正版',
            'release_notes' => ['bug_fixes' => ['修正']],
            'released_at' => now(),
            'environment' => 'Preview Build',
            'status' => 'released',
        ]);

        Sanctum::actingAs(User::factory()->withRole('level_2')->create());
        $this->getJson('/api/developer/releases')->assertForbidden();

        Sanctum::actingAs(User::factory()->withRole('developer')->create());
        $this->getJson('/api/developer/releases')
            ->assertOk()
            ->assertJsonPath('releases.data.0.version', '0.11.1')
            ->assertJsonPath('releases.data.1.version', '0.11.0');
    }

    private function validPayload(): array
    {
        return [
            'release_type' => 'patch',
            'title' => '修正版',
            'release_notes' => ['bug_fixes' => ['軽微な不具合を修正']],
        ];
    }
}
