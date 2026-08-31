<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Client;
use App\Models\Persona;
use App\Models\User;
use App\Services\ToolRegistry;
use Database\Seeders\CleanV2MasterSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CleanV2Test extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_clean_master_is_repeatable_without_operational_demo_data(): void
    {
        $this->seed(CleanV2MasterSeeder::class);
        $counts = $this->counts();
        $caseTypes = DB::table('case_types')->orderBy('id')->get(['id', 'name', 'parent_id', 'sort_order', 'is_active'])->toJson();
        $this->seed(CleanV2MasterSeeder::class);
        $this->assertSame($counts, $this->counts());
        $this->assertSame($caseTypes, DB::table('case_types')->orderBy('id')->get(['id', 'name', 'parent_id', 'sort_order', 'is_active'])->toJson());
        $this->assertDatabaseCount('document_types', 78);
        $this->assertDatabaseCount('document_purposes', 11);
        $this->assertSame(78, DB::table('document_types')->distinct()->count('code'));
        $this->assertDatabaseCount('case_types', 28);
        $this->assertDatabaseMissing('case_types', ['name' => '労災事故']);
        $this->assertFalse(CaseType::where('name', '継続技能')->sole()->is_active);
        foreach (['clients', 'case_files', 'case_documents', 'received_documents', 'case_tasks', 'case_deadlines',
            'case_activities', 'case_parties', 'case_type_document_rules', 'approval_requests', 'secretary_logs',
            'skill_proposals', 'users', 'employees'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        $this->assertFalse(Schema::hasTable('matters'));
        $this->assertFalse(Schema::hasTable('tasks'));
        $this->assertTrue(Schema::hasTable('employee_tasks'));
    }

    public function test_case_type_relation_resolves_subtype_and_canonical_parent(): void
    {
        $this->seed(CleanV2MasterSeeder::class);
        $client = Client::create(['name' => 'V2 client']);
        foreach (['療養（業務災害・通勤災害）' => '労災', '傷害事故' => '交通事故'] as $name => $parent) {
            $type = CaseType::where('name', $name)->sole();
            $case = CaseFile::create(['title' => 'V2 case', 'client_id' => $client->id, 'case_type_id' => $type->id]);
            $case->load('caseTypeOption.parent');
            $this->assertTrue($case->caseTypeOption->is($type));
            $this->assertSame($parent, $case->caseTypeOption->parent->name);
        }
    }

    public function test_stale_persona_cannot_invoke_disabled_skills_or_call_provider(): void
    {
        Http::preventStrayRequests();
        Http::fake();
        $this->seed(RolePermissionSeeder::class);
        $user = User::factory()->create(['role' => 'admin']);
        Persona::create(['name' => 'secretary', 'display_name' => 'AI', 'active' => true,
            'skills' => ['task_management', 'morning_briefing']]);
        foreach (['task_management', 'morning_briefing'] as $skill) {
            $this->actingAs($user, 'sanctum')->postJson('/api/ai/chat', [
                'persona' => 'secretary', 'skill' => $skill, 'message' => 'test',
            ])->assertUnprocessable()->assertJsonPath('code', 'ai_skill_unavailable');
        }
        $this->getJson('/api/personas')->assertOk()->assertJsonPath('personas.0.skills', []);
        Http::assertNothingSent();
    }

    public function test_legacy_delete_approval_cannot_be_created(): void
    {
        $this->expectException(ValidationException::class);
        app(ToolRegistry::class)->execute('request_approval', ['action_type' => 'delete_task', 'payload' => ['task_id' => 1]]);
    }

    public function test_cleanup_refuses_unapproved_environment_and_is_repeatable_in_isolated_tests(): void
    {
        Schema::create('matters', fn ($table) => $table->id());
        Schema::create('tasks', fn ($table) => $table->id());
        $migration = require database_path('migrations/2026_08_31_120000_remove_legacy_matter_tasks.php');
        $environment = app()->environment();
        try {
            app()->instance('env', 'production');
            try {
                $migration->up();
                $this->fail('Unapproved cleanup must be refused.');
            } catch (\RuntimeException $exception) {
                $this->assertStringContainsString('Remote cleanup is not authorized', $exception->getMessage());
            }
            $this->assertTrue(Schema::hasTable('tasks'));
            $this->assertTrue(Schema::hasTable('matters'));
        } finally {
            app()->instance('env', $environment);
        }
        $migration->up();
        $migration->up();
        $this->assertFalse(Schema::hasTable('tasks'));
        $this->assertFalse(Schema::hasTable('matters'));
    }

    private function counts(): array
    {
        $counts = [];
        foreach (['case_types', 'document_types', 'document_purposes', 'roles', 'permissions', 'offices', 'document_templates', 'document_template_items'] as $table) {
            $counts[$table] = DB::table($table)->count();
        }

        return $counts;
    }
}
