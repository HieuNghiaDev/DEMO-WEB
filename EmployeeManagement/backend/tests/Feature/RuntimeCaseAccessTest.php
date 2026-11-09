<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseMembership;
use App\Models\EmployeeNotification;
use App\Models\EmployeeTask;
use App\Models\User;
use App\Services\CaseAccessService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\AdminAContract;
use Tests\Support\B21\B21TestCase;

class RuntimeCaseAccessTest extends B21TestCase
{
    private function reader(string $label = 'reader', array $extra = []): User
    {
        $this->assertFalse($this->app->bound(CaseAccessService::class), 'Runtime tests must not enable rehearsal.');

        return $this->fixtureUser('a02-'.$label, ['case.view', ...$extra]);
    }

    private function secret(): CaseFile
    {
        $case = $this->matter();
        $case->forceFill(['title' => 'A02-SECRET-CASE', 'is_confidential' => true])->save();
        $case->client->update(['name' => 'A02-SECRET-CLIENT']);

        return $case;
    }

    private function grant(User $user, CaseFile $case, bool $write = false): CaseMembership
    {
        return CaseMembership::forceCreate(['case_file_id' => $case->id, 'user_id' => $user->id,
            'employee_id' => $user->employee_id, 'can_read' => true, 'can_write' => $write,
            'can_read_confidential' => true, 'expires_at' => now()->addHour(), 'revision' => 1]);
    }

    private function noLeak($response, int $status = 404): void
    {
        $response->assertStatus($status);
        $this->assertStringNotContainsString('A02-SECRET', $response->getContent());
    }

    public function test_normal_cases_remain_workspace_readable_without_membership(): void
    {
        $reader = $this->reader();
        $case = $this->matter();
        $this->actingAs($reader)->getJson('/api/case-files/'.$case->id)->assertOk();
        $this->assertDatabaseCount('case_memberships', 0);
    }

    public function test_confidential_read_requires_exact_explicit_membership_not_assignment_or_creator(): void
    {
        $reader = $this->reader();
        $case = $this->secret();
        $case->update(['assigned_employee_id' => $reader->employee_id, 'created_by_employee_id' => $reader->employee_id]);
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id));
        $this->grant($reader, $case);
        $this->getJson('/api/case-files/'.$case->id)->assertOk();
    }

    public function test_revocation_is_effective_on_next_request_despite_loaded_relations(): void
    {
        $reader = $this->reader();
        $case = $this->secret();
        $grant = $this->grant($reader, $case);
        $this->actingAs($reader)->getJson('/api/case-files/'.$case->id.'/workspace')->assertOk();
        $reader->load('roles.permissions');
        $grant->forceFill(['revoked_at' => now()])->save();
        $this->noLeak($this->getJson('/api/case-files/'.$case->id.'/workspace'));
    }

    public static function invalidGrants(): array
    {
        return [['expired'], ['wrong_employee'], ['no_read'], ['no_confidential'], ['other_case'], ['inactive_user'], ['inactive_employee']];
    }

    #[DataProvider('invalidGrants')]
    public function test_invalid_membership_or_identity_never_opens_confidential_content(string $state): void
    {
        $reader = $this->reader();
        $case = $this->secret();
        $grant = $this->grant($reader, $case);
        match ($state) {
            'expired' => $grant->forceFill(['expires_at' => now()->subSecond()])->save(),
            'wrong_employee' => $grant->forceFill(['employee_id' => $this->reader('other')->employee_id])->save(),
            'no_read' => $grant->forceFill(['can_read' => false])->save(),
            'no_confidential' => $grant->forceFill(['can_read_confidential' => false])->save(),
            'other_case' => $grant->forceFill(['case_file_id' => $this->matter()->id])->save(),
            'inactive_user' => $reader->update(['is_active' => false]),
            'inactive_employee' => $reader->employee->update(['status' => 'inactive']),
        };
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id), str_starts_with($state, 'inactive') ? 401 : 404);
    }

    public function test_admin_can_manage_directory_but_needs_explicit_content_grant(): void
    {
        $admin = $this->fixtureUser('a02-admin', [...AdminAContract::adminFixturePermissions(), 'case.view'], 'admin');
        $case = $this->secret();
        $this->actingAs($admin)->getJson('/api/organization')->assertOk();
        $this->noLeak($this->getJson('/api/case-files/'.$case->id));
        $this->grant($admin, $case);
        $this->getJson('/api/case-files/'.$case->id)->assertOk();
    }

    public function test_legacy_level_five_has_no_confidential_override(): void
    {
        $legacy = $this->actor('a02-level-five', 'level_5');
        $case = $this->secret();
        $this->actingAs($legacy);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id));
        $this->getJson('/api/case-files/'.$this->matter()->id)->assertOk();
    }

    public function test_membership_without_functional_permission_is_not_a_grant(): void
    {
        $reader = $this->fixtureUser('a02-no-functional', []);
        $case = $this->secret();
        $this->grant($reader, $case, true);
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id), 403);
    }

    public function test_list_scope_search_and_sql_count_exclude_hidden_cases_and_client_metadata(): void
    {
        $reader = $this->reader();
        $first = $this->matter();
        $second = $this->matter();
        $secret = $this->secret();
        $this->actingAs($reader);
        foreach (['/api/case-files', '/api/case-files?search=A02-SECRET'] as $url) {
            $response = $this->getJson($url)->assertOk()->assertJsonCount(2, 'case_files');
            $this->assertSame([$first->id, $second->id], collect($response->json('case_files'))->pluck('id')->sort()->values()->all());
            $this->assertStringNotContainsString('A02-SECRET', $response->getContent());
        }
        $this->assertSame(2, CaseFile::visibleTo($reader)->count());
        $this->assertFalse(CaseFile::visibleTo($reader)->whereKey($secret->id)->exists());
    }

    public static function paths(): array
    {
        return array_map(fn ($path) => [$path], ['', '/workspace', '/documents', '/document-collection',
            '/document-collection/{document}', '/document-collection/{document}/creation',
            '/document-collection/{document}/creation/pdf', '/case-tasks', '/case-tasks/{task}',
            '/history', '/communications/{communication}', '/meeting-logs']);
    }

    private function children(CaseFile $case, User $reader): array
    {
        $document = $case->documents()->create(['category' => 'required', 'title' => 'A02-SECRET-DOCUMENT',
            'note' => 'A02-SECRET-NOTE', 'file_url' => 'https://example.test/A02-SECRET-DRIVE/filename.pdf', 'status' => 'draft']);
        $task = $case->caseTasks()->create(['case_document_id' => $document->id, 'title' => 'A02-SECRET-TASK',
            'description' => 'A02-SECRET-DESCRIPTION', 'status' => 'unaccepted', 'assigned_employee_id' => $reader->employee_id]);
        $communication = $case->activities()->create(['activity_type' => 'communication', 'title' => 'A02-SECRET-COMMUNICATION',
            'occurred_at' => now(), 'metadata' => ['history_kind' => 'communication', 'communication' => []]]);

        return ['{document}' => $document->id, '{task}' => $task->id, '{communication}' => $communication->id];
    }

    #[DataProvider('paths')]
    public function test_direct_nested_paths_deny_before_serializing_confidential_markers(string $path): void
    {
        $reader = $this->reader('nested', ['document.view', 'task.view_all']);
        $case = $this->secret();
        $ids = $this->children($case, $reader);
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id.strtr($path, $ids)), $path === '/documents' ? 403 : 404);
    }

    public function test_write_scope_is_independent_from_read_and_functional_permission(): void
    {
        $reader = $this->reader('writer', ['case.update']);
        $case = $this->secret();
        $grant = $this->grant($reader, $case);
        $this->actingAs($reader)->getJson('/api/case-files/'.$case->id.'/workspace')->assertOk();
        $payload = ['incident_summary' => 'Synthetic changed summary'];
        $this->noLeak($this->patchJson('/api/case-files/'.$case->id.'/incident', $payload), 403);
        $this->assertNull($case->fresh()->incident_summary);
        $this->assertDatabaseCount('case_activities', 0);
        $grant->forceFill(['can_write' => true])->save();
        $this->patchJson('/api/case-files/'.$case->id.'/incident', $payload)->assertOk();
        $this->assertSame($payload['incident_summary'], $case->fresh()->incident_summary);
    }

    public function test_confidential_deadline_party_communication_and_document_mutations_are_denied(): void
    {
        $reader = $this->reader('write-denial', ['case.update', 'document.update', 'task.update']);
        $case = $this->secret();
        $ids = $this->children($case, $reader);
        $party = $case->parties()->create(['name' => 'A02-SECRET-PARTY', 'party_type' => 'other']);
        $deadline = $case->deadlines()->create(['deadline_type' => 'other', 'title' => 'A02-SECRET-DEADLINE', 'due_at' => now()->addDay()]);
        $this->actingAs($reader);
        foreach (["parties/{$party->id}", "deadlines/{$deadline->id}", 'communications/'.$ids['{communication}']] as $path) {
            $this->noLeak($this->patchJson('/api/case-files/'.$case->id.'/'.$path, []));
        }
        $this->noLeak($this->patchJson('/api/case-files/'.$case->id.'/documents/'.$ids['{document}'], []), 403);
        $this->noLeak($this->postJson('/api/case-files/'.$case->id.'/case-tasks/'.$ids['{task}'].'/accept'));
        $this->assertSame('unaccepted', $case->caseTasks()->sole()->status);
        $this->assertDatabaseCount('case_activities', 1);
    }

    public function test_client_routes_hide_exclusive_secret_context_and_filter_shared_case_relations(): void
    {
        $reader = $this->reader();
        $case = $this->secret();
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/clients/'.$case->client_id));
        $this->noLeak($this->getJson('/api/clients/'.$case->client_id.'/employments'));
        $this->assertStringNotContainsString('A02-SECRET', $this->getJson('/api/clients')->assertOk()->getContent());
        $normal = $this->matter();
        $normal->update(['client_id' => $case->client_id]);
        \App\Models\ExternalStorageLocation::create(['provider' => 'google_drive', 'entity_type' => 'client',
            'entity_id' => $case->client_id, 'location_type' => 'client_folder', 'external_folder_id' => 'synthetic-shared-folder',
            'external_url' => 'https://drive.google.com/drive/folders/A02-SECRET-DRIVE', 'display_name' => 'Synthetic folder']);
        $response = $this->getJson('/api/clients/'.$case->client_id)->assertOk()->assertJsonCount(1, 'client.case_files');
        $response->assertJsonPath('client.case_files.0.id', $normal->id);
        $this->assertNotContains($case->id, collect($response->json('client.case_files'))->pluck('id')->all());
        $response->assertJsonPath('drive.status', 'restricted')->assertJsonPath('drive.url', null);
        $this->assertStringNotContainsString('A02-SECRET-DRIVE', $response->getContent());
    }

    public function test_task_lists_ai_tool_and_persisted_notifications_observe_case_scope_after_revoke(): void
    {
        $reader = $this->reader('task-reader', ['task.view_own', 'task.view_all']);
        $case = $this->secret();
        $ids = $this->children($case, $reader);
        $legacy = EmployeeTask::create(['employee_id' => $reader->employee_id, 'case_document_id' => $ids['{document}'],
            'assigned_by' => $reader->id, 'title' => 'A02-SECRET-LEGACY-TASK', 'status' => 'pending', 'duration_minutes' => 30]);
        EmployeeNotification::create(['user_id' => $reader->id, 'kind' => 'info', 'title' => 'A02-SECRET-NOTICE',
            'message' => 'A02-SECRET-NOTIFICATION-BODY', 'data' => ['case_task_id' => $ids['{task}'], 'target_path' => '/quests/'.$case->id]]);
        $this->actingAs($reader);
        foreach (['/api/my/tasks', '/api/notifications'] as $url) {
            $this->assertStringNotContainsString('A02-SECRET', $this->getJson($url)->assertOk()->getContent());
        }
        $this->assertFalse($legacy->isVisibleTo($reader));
        $this->assertFalse(\App\Models\CaseTask::visibleTo($reader)->whereKey($ids['{task}'])->exists());
        $result = app(\App\AI\Tools\QueryCaseTasksTool::class)->execute(['scope' => 'my']);
        $this->assertStringNotContainsString('A02-SECRET', json_encode($result));
        $grant = $this->grant($reader, $case);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'notifications');
        $grant->forceFill(['revoked_at' => now()])->save();
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'notifications');
    }

    public function test_case_list_authorization_query_count_does_not_grow_per_row(): void
    {
        $reader = $this->reader('scale');
        $this->secret();
        $this->matter();
        $this->actingAs($reader);
        $measure = function (): int {
            DB::enableQueryLog();
            DB::flushQueryLog();
            try {
                $this->getJson('/api/case-files')->assertOk();

                return count(DB::getQueryLog());
            } finally {
                DB::disableQueryLog();
            }
        };
        $small = $measure();
        for ($i = 0; $i < 15; $i++) $this->matter();
        $large = $measure();
        $this->assertLessThanOrEqual($small + 5, $large, 'Case scope must not authorize one row at a time.');
    }

    public function test_confidential_cases_fail_closed_when_mapping_table_is_missing(): void
    {
        $reader = $this->reader('missing-table');
        $case = $this->secret();
        $normal = $this->matter();
        Schema::drop('case_memberships'); // Isolated SQLite only; no fallback for classified confidential rows.
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id));
        $this->getJson('/api/case-files/'.$normal->id)->assertOk();
    }

    public function test_proposed_schema_never_classifies_existing_cases_or_creates_grants(): void
    {
        $reader = $this->reader('schema');
        $case = $this->matter();
        Schema::table('case_files', fn ($table) => $table->dropColumn('is_confidential'));
        Schema::drop('case_memberships');
        config(['case_access_rollout.expected_target' => ['connection' => 'sqlite', 'driver' => 'sqlite', 'database' => ':memory:']]);
        $proposal = require database_path('proposals/create_runtime_case_access.php');
        $proposal->up();
        $this->assertNull($case->fresh()->getRawOriginal('is_confidential'));
        $this->assertDatabaseCount('case_memberships', 0);
        $this->actingAs($reader);
        $this->noLeak($this->getJson('/api/case-files/'.$case->id));
        $case->forceFill(['is_confidential' => false])->save(); // Explicit synthetic classification, never a backfill rule.
        $this->getJson('/api/case-files/'.$case->id)->assertOk();
    }

    public function test_task_without_persisted_parent_cannot_advertise_write_actions(): void
    {
        $reader = $this->reader('missing-parent', ['task.update', 'task.manage']);
        $task = new \App\Models\CaseTask(['status' => 'unaccepted', 'assigned_employee_id' => $reader->employee_id]);
        $actions = $task->allowedActionsFor($reader);
        $this->assertFalse($actions['can_accept']);
        $this->assertFalse($actions['can_reassign']);
    }

    public function test_shared_client_delete_cannot_bypass_read_only_confidential_grant(): void
    {
        $reader = $this->reader('client-delete', ['case.delete']);
        $case = $this->secret();
        $this->grant($reader, $case); // No write grant; functional delete is insufficient.
        $this->actingAs($reader);
        $this->noLeak($this->deleteJson('/api/clients/'.$case->client_id.'?delete_case_files=1'), 403);
        $this->assertDatabaseHas('case_files', ['id' => $case->id, 'deleted_at' => null]);
        $this->assertDatabaseHas('clients', ['id' => $case->client_id, 'deleted_at' => null]);
    }
}
