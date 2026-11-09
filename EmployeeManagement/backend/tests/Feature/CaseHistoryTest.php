<?php

namespace Tests\Feature;

use App\Models\CaseActivity;
use App\Models\CaseFile;
use App\Models\CaseMeetingLog;
use App\Models\CaseParty;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use App\Services\CaseWorkspaceAuditService;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CaseHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_create_and_edit_communication_generate_immutable_audit_in_same_transaction(): void
    {
        [$user, $case, $employee] = $this->fixture();
        $party = CaseParty::create(['case_file_id' => $case->id, 'party_type' => 'other', 'name' => '通訳']);
        $payload = $this->payload($case);
        $payload['participants'] = [['type' => 'employee', 'id' => $employee->id], ['type' => 'party', 'id' => $party->id]];
        $response = $this->actingAs($user, 'sanctum')->postJson($this->path($case), $payload)
            ->assertCreated()->assertJsonPath('entry.kind', 'communication')->assertJsonPath('entry.type', 'phone')
            ->assertJsonPath('entry.communication.duration_minutes', 32)
            ->assertJsonPath('entry.communication.counterparties.0.name', 'PHAM GIA HUY')
            ->assertJsonPath('entry.communication.participants.1.name', '通訳');
        $id = $response->json('entry.record_id');
        $this->assertDatabaseCount('case_activities', 2);
        $payload['summary'] = '診断書を依頼しました。';
        $this->patchJson($this->path($case, $id), $payload)->assertOk()->assertJsonPath('entry.summary', $payload['summary']);
        $this->assertDatabaseCount('case_activities', 3);
        $audit = CaseActivity::latest('id')->first();
        $this->assertSame('communication.updated', $audit->metadata['event']);
        $this->assertSame('治療状況を確認', $audit->metadata['changes']['summary']['before']);
        $this->assertSame($employee->id, $audit->created_by_employee_id);
        $this->getJson("/api/case-files/{$case->id}/history?kind=system")->assertOk()->assertJsonCount(2, 'entries')->assertJsonPath('entries.0.permissions.can_edit', false);
        $this->patchJson($this->path($case, $audit->id), $payload)->assertForbidden();
        $this->deleteJson($this->path($case, $id))->assertStatus(405);
    }

    public function test_all_eight_types_and_duration_validation(): void
    {
        [$user, $case] = $this->fixture();
        $this->actingAs($user, 'sanctum');
        foreach (['phone', 'email', 'chat', 'online_meeting', 'office_meeting', 'visit', 'postal_mail', 'other'] as $type) {
            $data = [...$this->payload($case), 'communication_type' => $type];
            $response = $this->postJson($this->path($case), $data)->assertCreated();
            $this->assertSame(in_array($type, ['email', 'chat', 'postal_mail']) ? null : 32, $response->json('entry.communication.duration_minutes'));
            $this->assertSame(in_array($type, ['phone', 'email', 'chat', 'postal_mail']) ? 'outbound' : null, $response->json('entry.communication.direction'));
        }
        $this->postJson($this->path($case), [...$this->payload($case), 'ended_at' => '2026-10-09T13:00:00+09:00'])->assertUnprocessable();
        $this->postJson($this->path($case), [...$this->payload($case), 'counterparties' => []])->assertUnprocessable();
    }

    public function test_reference_validation_and_cross_case_idor(): void
    {
        [$user, $case] = $this->fixture();
        $other = CaseFile::create(['title' => '別案件', 'client_id' => Client::create(['name' => '別顧客'])->id, 'status' => 'active']);
        $party = CaseParty::create(['case_file_id' => $other->id, 'party_type' => 'other', 'name' => '別関係者']);
        $this->actingAs($user, 'sanctum');
        foreach ([['type' => 'client', 'id' => $other->client_id], ['type' => 'party', 'id' => $party->id], ['type' => 'external', 'id' => 99, 'name' => '偽装']] as $person) {
            $this->postJson($this->path($case), [...$this->payload($case), 'counterparties' => [$person]])->assertUnprocessable();
        }
        $id = $this->postJson($this->path($case), $this->payload($case))->assertCreated()->json('entry.record_id');
        $this->getJson($this->path($other, $id))->assertNotFound();
        $this->patchJson($this->path($other, $id), $this->payload($other))->assertNotFound();
        $this->postJson($this->path($other, $id).'/task', ['assigned_employee_id' => $user->employee_id, 'title' => '次回対応'])->assertNotFound();
        $this->getJson("/api/case-files/{$other->id}/history")->assertOk()->assertJsonCount(0, 'entries');
    }

    public function test_permissions_and_forged_operation_creation_are_denied(): void
    {
        [$manager, $case, $employee] = $this->fixture();
        $id = $this->actingAs($manager, 'sanctum')->postJson($this->path($case), $this->payload($case))->json('entry.record_id');
        $viewer = $manager->fresh();
        $viewer->roles()->sync([Role::where('name', 'level_1')->value('id')]);
        $this->actingAs($viewer, 'sanctum')->getJson("/api/case-files/{$case->id}/history")->assertOk()->assertJsonPath('permissions.can_add_communication', false);
        $this->postJson($this->path($case), $this->payload($case))->assertForbidden();
        $this->patchJson($this->path($case, $id), $this->payload($case))->assertForbidden();
        $this->postJson($this->path($case, $id).'/task', ['title' => 'task', 'assigned_employee_id' => $employee->id])->assertForbidden();
        $noAccess = User::factory()->create();
        $this->actingAs($noAccess, 'sanctum')->getJson("/api/case-files/{$case->id}/history")->assertForbidden();
        $manager->roles()->sync([Role::where('name', 'level_4')->value('id')]);
        $this->actingAs($manager, 'sanctum');
        $this->postJson($this->path($case), [...$this->payload($case), 'metadata' => ['event' => 'file.approved']])->assertUnprocessable();
        $this->postJson("/api/case-files/{$case->id}/activities", ['activity_type' => 'note', 'channel' => 'internal', 'title' => '偽操作', 'occurred_at' => now()])->assertUnprocessable();
        $this->postJson("/api/case-files/{$case->id}/activities", ['activity_type' => 'communication', 'title' => '偽操作', 'occurred_at' => now(), 'metadata' => ['history_kind' => 'system']])->assertUnprocessable();
    }

    public function test_unified_timeline_pagination_filters_and_legacy_preservation(): void
    {
        [$user, $case] = $this->fixture();
        $this->actingAs($user, 'sanctum');
        $this->postJson($this->path($case), $this->payload($case))->assertCreated();
        $legacy = CaseMeetingLog::create(['case_file_id' => $case->id, 'meeting_date' => '2026-10-09', 'interaction_type' => 'meeting', 'attendees' => '旧参加者', 'content' => '旧面談の内容', 'status' => 'confirmed']);
        CaseActivity::create(['case_file_id' => $case->id, 'activity_type' => 'note', 'channel' => 'internal', 'title' => 'ファイル v2 をアップロード', 'occurred_at' => '2026-10-09 07:00:01', 'metadata' => ['document_file_event' => true]]);
        $response = $this->getJson("/api/case-files/{$case->id}/history?per_page=2")->assertOk()->assertJsonCount(2, 'entries')->assertJsonPath('pagination.total', 4)->assertJsonPath('pagination.last_page', 2);
        $this->assertSame('system', $response->json('entries.0.kind'));
        $this->getJson("/api/case-files/{$case->id}/history?kind=communication&from=2026-10-09&to=2026-10-09")->assertOk()->assertJsonCount(2, 'entries');
        $this->getJson("/api/case-files/{$case->id}/history?type=phone")->assertOk()->assertJsonCount(1, 'entries');
        $this->getJson("/api/case-files/{$case->id}/history?search=旧面談")->assertOk()->assertJsonPath('entries.0.id', 'meeting:'.$legacy->id)->assertJsonPath('entries.0.permissions.can_edit', false);
        $this->getJson("/api/case-files/{$case->id}/history?kind=communication&search=診断書")->assertOk()->assertJsonCount(1, 'entries');
        $this->getJson("/api/case-files/{$case->id}/history?actor_id={$user->employee_id}")->assertOk()->assertJsonCount(2, 'entries');
        $this->getJson("/api/case-files/{$case->id}/history?per_page=1000")->assertUnprocessable();
    }

    public function test_server_pagination_has_stable_complete_pages_and_filtered_authorized_totals(): void
    {
        [$user, $case, $employee] = $this->fixture();
        $expected = [];
        foreach (range(1, 45) as $index) {
            $system = $index % 2 === 0;
            $activity = CaseActivity::create([
                'case_file_id' => $case->id, 'activity_type' => $system ? 'note' : 'communication',
                'channel' => $system ? 'internal' : 'phone', 'title' => '対象履歴 '.$index,
                'occurred_at' => '2026-10-09 05:00:00', 'created_by_employee_id' => $employee->id,
                'metadata' => $system ? ['history_kind' => 'system', 'event' => 'document.updated'] : [],
            ]);
            $expected[] = ['id' => $activity->id, 'source' => 'activity'];
        }
        $meeting = CaseMeetingLog::create(['case_file_id' => $case->id, 'meeting_date' => '2026-10-09 05:00:00', 'interaction_type' => 'phone', 'content' => '対象履歴 旧形式', 'status' => 'confirmed', 'created_by_employee_id' => $employee->id]);
        $expected[] = ['id' => $meeting->id, 'source' => 'meeting'];
        usort($expected, fn ($left, $right) => ($right['id'] <=> $left['id']) ?: strcmp($right['source'], $left['source']));
        $other = CaseFile::create(['title' => '別案件', 'client_id' => $case->client_id, 'status' => 'active']);
        CaseActivity::create(['case_file_id' => $other->id, 'activity_type' => 'note', 'title' => '漏洩しない', 'occurred_at' => now()]);
        $url = "/api/case-files/{$case->id}/history";
        $this->actingAs($user, 'sanctum');
        $ids = [];
        foreach ([1, 2, 3, 4] as $page) {
            $response = $this->getJson($url.'?page='.$page)->assertOk()
                ->assertJsonPath('pagination.current_page', $page)->assertJsonPath('pagination.per_page', 15)
                ->assertJsonPath('pagination.total', 46)->assertJsonPath('pagination.last_page', 4)
                ->assertJsonPath('pagination.from', ($page - 1) * 15 + 1)->assertJsonPath('pagination.to', min($page * 15, 46))
                ->assertJsonPath('counts.all', 46)->assertJsonPath('counts.system', 22)->assertJsonPath('counts.communication', 24)
                ->assertJsonCount($page < 4 ? 15 : 1, 'entries');
            $ids = [...$ids, ...array_column($response->json('entries'), 'id')];
        }
        $this->assertSame(array_map(fn ($row) => $row['source'].':'.$row['id'], $expected), $ids);
        $this->assertCount(46, array_unique($ids));
        foreach ([30, 50] as $size) {
            $this->getJson($url.'?per_page='.$size)->assertOk()->assertJsonCount(min(46, $size), 'entries')->assertJsonPath('pagination.per_page', $size);
        }
        $this->getJson($url.'?kind=system&page=2')->assertOk()->assertJsonCount(7, 'entries')->assertJsonPath('pagination.total', 22)->assertJsonPath('counts.all', 46);
        $this->getJson($url.'?kind=communication&type=phone&actor_id='.$employee->id.'&from=2026-10-09&to=2026-10-09&search=対象履歴&page=2')
            ->assertOk()->assertJsonCount(9, 'entries')->assertJsonPath('pagination.total', 24)->assertJsonPath('counts.system', 0)->assertJsonPath('counts.communication', 24);
        $this->getJson($url.'?search=存在しない&page=9')->assertOk()->assertJsonCount(0, 'entries')->assertJsonPath('pagination.current_page', 1)->assertJsonPath('pagination.total', 0)->assertJsonPath('pagination.from', null);
        $this->getJson($url.'?page=999')->assertOk()->assertJsonPath('pagination.current_page', 4)->assertJsonCount(1, 'entries');
    }

    public function test_explicit_next_action_creates_exactly_one_existing_case_task(): void
    {
        [$user, $case, $employee] = $this->fixture();
        $this->actingAs($user, 'sanctum');
        $id = $this->postJson($this->path($case), $this->payload($case))->assertCreated()->json('entry.record_id');
        $this->assertDatabaseCount('case_tasks', 0);
        $payload = ['title' => '診断書を確認', 'assigned_employee_id' => $employee->id, 'due_at' => '2026-10-16T09:00:00+09:00'];
        $taskId = $this->postJson($this->path($case, $id).'/task', $payload)->assertCreated()->json('task.id');
        $this->postJson($this->path($case, $id).'/task', $payload)->assertConflict();
        $this->assertDatabaseCount('case_tasks', 1);
        $this->assertDatabaseHas('case_tasks', ['id' => $taskId, 'case_file_id' => $case->id, 'case_document_id' => null, 'status' => 'unaccepted']);
        $this->getJson($this->path($case, $id))->assertOk()->assertJsonPath('entry.linked_task.id', $taskId)->assertJsonPath('entry.permissions.can_create_task', false);
        $this->patchJson($this->path($case, $id), [...$this->payload($case), 'subject' => '更新'])->assertOk()->assertJsonPath('entry.linked_task.id', $taskId);
        $this->postJson($this->path($case, $id).'/task', $payload)->assertConflict();
    }

    public function test_private_task_audit_and_link_are_not_leaked(): void
    {
        [$user, $case, $employee] = $this->fixture();
        $other = Employee::create(['employee_code' => 'HST-2', 'full_name' => '別担当', 'office_id' => $employee->office_id, 'status' => 'active', 'employment_type' => 'full_time', 'hire_date' => '2026-01-01']);
        $this->actingAs($user, 'sanctum');
        $id = $this->postJson($this->path($case), $this->payload($case))->json('entry.record_id');
        $this->postJson($this->path($case, $id).'/task', ['title' => '非公開タスク', 'assigned_employee_id' => $other->id])->assertCreated();
        $viewer = $user->fresh();
        $viewer->roles()->sync([Role::where('name', 'level_1')->value('id')]);
        $response = $this->actingAs($viewer, 'sanctum')->getJson("/api/case-files/{$case->id}/history")->assertOk();
        $this->assertStringNotContainsString('非公開タスク', $response->getContent());
        $response->assertJsonPath('counts.all', 2)->assertJsonPath('counts.system', 1)->assertJsonPath('counts.communication', 1)->assertJsonPath('pagination.total', 2);
        $this->getJson($this->path($case, $id))->assertOk()->assertJsonPath('entry.linked_task', null)->assertJsonPath('entry.communication.has_linked_task', true);
    }

    public function test_external_fallback_and_deadline_before_after_are_recorded(): void
    {
        [$user, $case] = $this->fixture();
        $this->actingAs($user, 'sanctum');
        $this->postJson($this->path($case), [...$this->payload($case), 'counterparties' => [['type' => 'external', 'name' => '未登録の通訳']]])->assertCreated()->assertJsonPath('entry.communication.counterparties.0.id', null);
        $deadline = $this->postJson("/api/case-files/{$case->id}/deadlines", ['title' => '提出', 'deadline_type' => 'submission', 'due_at' => '2026-10-12'])->assertCreated()->json('deadline.id');
        $this->patchJson("/api/case-files/{$case->id}/deadlines/{$deadline}", ['due_at' => '2026-10-16'])->assertOk();
        $entry = collect($this->getJson("/api/case-files/{$case->id}/history?kind=system")->assertOk()->json('entries'))->firstWhere('title', '期限を更新');
        $this->assertArrayHasKey('due_at', $entry['changes']);
        $this->assertNotSame($entry['changes']['due_at']['before'], $entry['changes']['due_at']['after']);
    }

    public function test_untagged_internal_notes_remain_readonly_business_records_not_fake_audit(): void
    {
        [$user, $case] = $this->fixture();
        $note = CaseActivity::create(['case_file_id' => $case->id, 'activity_type' => 'note', 'channel' => 'internal', 'title' => '手入力のメモ', 'occurred_at' => now()]);
        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case->id}/history?kind=system")->assertOk()->assertJsonCount(0, 'entries');
        $this->getJson("/api/case-files/{$case->id}/history?kind=communication")->assertOk()->assertJsonPath('entries.0.record_id', $note->id)->assertJsonPath('entries.0.legacy', true)->assertJsonPath('entries.0.permissions.can_edit', false);
    }

    public function test_legacy_meeting_writer_also_enforces_permissions_and_records_edit_audit(): void
    {
        [$user, $case] = $this->fixture();
        $this->actingAs($user, 'sanctum');
        $id = $this->postJson("/api/case-files/{$case->id}/meeting-logs", ['meeting_date' => '2026-10-09', 'content' => '旧連絡記録', 'interaction_type' => 'phone'])->assertCreated()->json('meeting_log.id');
        $this->patchJson("/api/case-files/{$case->id}/meeting-logs/{$id}", ['content' => '旧連絡を更新'])->assertOk();
        $this->assertDatabaseCount('case_activities', 2);
        $this->assertSame('communication.legacy_updated', CaseActivity::latest('id')->first()->metadata['event']);
        $other = CaseFile::create(['title' => '別案件', 'client_id' => $case->client_id, 'status' => 'active']);
        $this->patchJson("/api/case-files/{$other->id}/meeting-logs/{$id}", ['content' => '不正'])->assertNotFound();
        $user->roles()->sync([Role::where('name', 'level_1')->value('id')]);
        $this->actingAs($user->fresh(), 'sanctum')->patchJson("/api/case-files/{$case->id}/meeting-logs/{$id}", ['content' => '不正'])->assertForbidden();
    }

    public function test_audit_failure_rolls_back_communication_and_noop_edit_does_not_create_log(): void
    {
        [$user, $case] = $this->fixture();
        $this->actingAs($user, 'sanctum');
        $id = $this->postJson($this->path($case), $this->payload($case))->assertCreated()->json('entry.record_id');
        $this->patchJson($this->path($case, $id), $this->payload($case))->assertOk();
        $this->assertDatabaseCount('case_activities', 2);
        $this->mock(CaseWorkspaceAuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('audit failure'));
        foreach ($this->app['router']->getRoutes() as $route) {
            if (str_contains($route->getActionName(), 'CaseHistoryController')) {
                $route->flushController();
            }
        }
        $this->postJson($this->path($case), $this->payload($case))->assertServerError();
        $this->patchJson($this->path($case, $id), [...$this->payload($case), 'subject' => '更新失敗'])->assertServerError();
        $this->assertDatabaseCount('case_activities', 2);
        $this->assertSame('診断書の提出', CaseActivity::find($id)->title);
    }

    public function test_case_information_and_assignment_changes_use_existing_audit_with_actor_and_details(): void
    {
        [$user, $case, $employee] = $this->fixture();
        $this->actingAs($user, 'sanctum')->patchJson("/api/case-files/{$case->id}", ['title' => '案件名を更新'])->assertOk();
        $this->patchJson("/api/case-files/{$case->id}/assignee", ['assigned_employee_id' => $employee->id])->assertOk();
        $response = $this->getJson("/api/case-files/{$case->id}/history?kind=system")->assertOk()->assertJsonCount(2, 'entries');
        $entry = collect($response->json('entries'))->firstWhere('title', '案件担当者を変更');
        $this->assertSame('未割当', $entry['changes']['assigned_employee_id']['before']);
        $this->assertSame('LE HIEU NGHIA', $entry['changes']['assigned_employee_id']['after']);
        $this->assertSame('LE HIEU NGHIA', $entry['actor']['full_name']);
        $this->assertNotEmpty($entry['occurred_at']);
    }

    private function fixture(): array
    {
        $this->seed(RolePermissionSeeder::class);
        $office = Office::create(['office_code' => 'HST', 'name' => '履歴テスト', 'status' => 'active']);
        $employee = Employee::create(['employee_code' => 'HST-1', 'full_name' => 'LE HIEU NGHIA', 'office_id' => $office->id, 'status' => 'active', 'employment_type' => 'full_time', 'hire_date' => '2026-01-01']);
        $user = User::factory()->create(['employee_id' => $employee->id]);
        $user->roles()->sync([Role::where('name', 'level_4')->value('id')]);
        $case = CaseFile::create(['title' => '事故案件', 'client_id' => Client::create(['name' => 'PHAM GIA HUY'])->id, 'status' => 'active']);

        return [$user, $case, $employee];
    }

    private function payload(CaseFile $case): array
    {
        return ['communication_type' => 'phone', 'direction' => 'outbound', 'started_at' => '2026-10-09T14:00:00+09:00', 'ended_at' => '2026-10-09T14:32:00+09:00',
            'subject' => '診断書の提出', 'summary' => '治療状況を確認', 'details' => '週2回通院中', 'outcome' => '提出予定', 'next_action' => '提出を確認', 'next_action_due_at' => '2026-10-16T09:00:00+09:00',
            'counterparties' => [['type' => 'client', 'id' => $case->client_id]], 'participants' => []];
    }

    private function path(CaseFile $case, ?int $id = null): string
    {
        return "/api/case-files/{$case->id}/communications".($id ? "/{$id}" : '');
    }
}
