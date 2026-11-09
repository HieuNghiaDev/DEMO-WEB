<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\Interpreter;
use App\Models\InterpretationRequest;
use App\Models\User;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Support\B21\B21TestCase;

class InterpretationManagementTest extends B21TestCase
{
    private User $manager;
    private CaseFile $case;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = $this->fixtureUser('interpret-manager', $this->permissions());
        $this->case = $this->matter();
        $this->actingAs($this->manager);
    }

    private function permissions(): array
    {
        return ['case.view', 'employee.view', ...array_map(fn ($action) => 'interpretation.'.$action,
            ['view', 'create', 'update', 'assign', 'transition', 'cancel'])];
    }

    private function url(string $suffix = '', ?CaseFile $case = null): string
    {
        return '/api/case-files/'.($case ?? $this->case)->id.'/interpretation-requests'.$suffix;
    }

    private function payload(array $extra = []): array
    {
        return array_replace(['language' => 'ベトナム語', 'work_type' => 'consultation', 'mode' => 'online',
            'content' => 'Synthetic interpretation meeting', 'starts_at' => '2026-12-10T09:00:00+09:00',
            'ends_at' => '2026-12-10T10:00:00+09:00', 'location' => null, 'notes' => null,
            'request_key' => (string) Str::uuid()], $extra);
    }

    private function profile(): int
    {
        return $this->postJson($this->url('/interpreters'), ['kind' => 'external', 'display_name' => 'Synthetic external interpreter',
            'registration_key' => (string) Str::uuid()])->assertCreated()->json('interpreter.id');
    }

    private function create(array $extra = []): array
    {
        return $this->postJson($this->url(), $this->payload($extra))->assertCreated()->json('item');
    }

    private function advanceStatus(array $item, string $status, array $extra = []): array
    {
        return $this->postJson($this->url('/'.$item['id'].'/status'), ['status' => $status, 'revision' => $item['revision'], ...$extra])
            ->assertOk()->json('item');
    }

    public function test_guest_and_case_reader_without_explicit_permission_are_denied(): void
    {
        $this->app['auth']->forgetGuards();
        $this->getJson($this->url())->assertUnauthorized();
        $reader = $this->fixtureUser('interpret-reader-none', ['case.view']);
        $this->actingAs($reader);
        $this->getJson($this->url())->assertForbidden();
        $this->postJson($this->url(), $this->payload())->assertForbidden();
        $this->assertDatabaseCount('interpretation_requests', 0);
    }

    public function test_list_empty_counts_and_pagination_are_real_and_case_scoped(): void
    {
        $this->getJson($this->url())->assertOk()->assertJsonCount(0, 'items')
            ->assertJsonPath('statistics.pending', 0)->assertJsonPath('pagination.total', 0);
        for ($i = 0; $i < 21; $i++) $this->create();
        $this->getJson($this->url())->assertOk()->assertJsonCount(20, 'items')
            ->assertJsonPath('statistics.pending', 21)->assertJsonPath('pagination.total', 21)->assertJsonPath('pagination.last_page', 2);
        $this->getJson($this->url().'?page=2')->assertOk()->assertJsonCount(1, 'items');
        $this->getJson($this->url('', $this->matter()))->assertOk()->assertJsonPath('pagination.total', 0);
    }

    public function test_create_unassigned_links_case_actor_and_utc_without_copying_client(): void
    {
        $item = $this->create();
        $this->assertSame('pending', $item['status']);
        $this->assertNull($item['interpreter']);
        $this->assertSame('2026-12-10T00:00:00.000000Z', $item['starts_at']);
        $this->assertSame('2026-12-10 00:00:00', DB::table('interpretation_requests')->value('starts_at'));
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'case_file_id' => $this->case->id,
            'created_by_user_id' => $this->manager->id, 'updated_by_user_id' => $this->manager->id]);
        $this->assertFalse(Schema::hasColumn('interpretation_requests', 'client_name'));
        $this->assertSame('interpretation.created', $this->case->activities()->sole()->metadata['event']);
        $this->getJson('/api/case-files/'.$this->case->id.'/history?kind=system')->assertOk()
            ->assertJsonCount(1, 'entries')->assertJsonPath('entries.0.title', '通訳依頼を追加')
            ->assertJsonPath('entries.0.summary', null);
    }

    public function test_client_cannot_spoof_identity_case_status_or_finance(): void
    {
        foreach (['case_file_id', 'case_id', 'client_id', 'user_id', 'created_by_user_id', 'updated_by_user_id', 'status', 'fee', 'invoice_id'] as $field) {
            $this->postJson($this->url(), $this->payload([$field => 999]))->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertDatabaseCount('interpretation_requests', 0);
    }

    public function test_required_fields_and_invalid_times_are_rejected_without_writes(): void
    {
        $this->postJson($this->url(), [])->assertUnprocessable();
        foreach (['2026-12-10T08:00:00+09:00', '2026-12-10T09:00:00+09:00', '2026-12-12T09:00:00+09:00'] as $end) {
            $this->postJson($this->url(), $this->payload(['ends_at' => $end]))->assertUnprocessable();
        }
        $this->postJson($this->url(), $this->payload(['starts_at' => '2026-12-10 09:00:00']))->assertUnprocessable();
        $this->postJson($this->url(), $this->payload(['language' => '   ']))->assertUnprocessable();
        $this->assertDatabaseCount('interpretation_requests', 0);
    }

    public function test_create_retry_is_idempotent_and_conflicting_key_is_denied(): void
    {
        $data = $this->payload();
        $first = $this->postJson($this->url(), $data)->assertCreated()->json('item.id');
        $this->postJson($this->url(), $data)->assertCreated()->assertJsonPath('item.id', $first);
        $this->postJson($this->url(), [...$data, 'content' => 'Changed'])->assertConflict();
        $this->assertDatabaseCount('interpretation_requests', 1);
        $this->assertDatabaseCount('case_activities', 1);
    }

    public function test_external_and_internal_profiles_use_one_registry_without_hr_serialization(): void
    {
        $id = $this->profile();
        $internal = $this->postJson($this->url('/interpreters'), ['kind' => 'employee', 'employee_id' => $this->manager->employee_id,
            'registration_key' => (string) Str::uuid()])->assertCreated()->json('interpreter');
        $this->assertSame($this->manager->employee->full_name, $internal['name']);
        $this->assertNull(Interpreter::find($internal['id'])->display_name);
        $response = $this->getJson($this->url('/options'))->assertOk()->assertJsonCount(2, 'interpreters');
        foreach (['phone', 'date_of_birth', 'nationality_code', 'work_email', 'registration_hash', 'created_by_user_id'] as $field) {
            $this->assertArrayNotHasKey($field, $response->json('interpreters.0'));
        }
        $this->assertSame($id, $response->json('interpreters.0.id'));
    }

    public function test_profile_retry_does_not_duplicate_directory_or_audit(): void
    {
        $payload = ['kind' => 'external', 'display_name' => 'Synthetic once', 'registration_key' => (string) Str::uuid()];
        $id = $this->postJson($this->url('/interpreters'), $payload)->assertCreated()->json('interpreter.id');
        $this->postJson($this->url('/interpreters'), $payload)->assertCreated()->assertJsonPath('interpreter.id', $id);
        $this->postJson($this->url('/interpreters'), [...$payload, 'display_name' => 'Different'])->assertConflict();
        $this->assertDatabaseCount('interpreters', 1);
        $this->assertDatabaseCount('case_activities', 1);
    }

    public function test_assignment_and_directory_registration_require_separate_explicit_permission(): void
    {
        $id = $this->profile();
        $item = $this->create();
        $this->actingAs($this->fixtureUser('interpret-editor', ['case.view', 'interpretation.view', 'interpretation.create', 'interpretation.update']));
        $this->patchJson($this->url('/'.$item['id'].'/assignment'), ['revision' => 1, 'interpreter_id' => $id])->assertForbidden();
        $this->postJson($this->url(), $this->payload(['interpreter_id' => $id]))->assertForbidden();
        $this->postJson($this->url('/interpreters'), ['kind' => 'external', 'display_name' => 'Denied', 'registration_key' => (string) Str::uuid()])->assertForbidden();
        $this->getJson($this->url())->assertOk()->assertJsonPath('capabilities.can_assign', false);
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'interpreter_id' => null]);
    }

    public function test_internal_registration_needs_directory_permission_and_active_employee(): void
    {
        $this->actingAs($this->fixtureUser('interpret-assign-only', ['case.view', 'interpretation.view', 'interpretation.assign']));
        $this->postJson($this->url('/interpreters'), ['kind' => 'employee', 'employee_id' => $this->manager->employee_id,
            'registration_key' => (string) Str::uuid()])->assertForbidden();
        $this->getJson($this->url('/options'))->assertOk()->assertJsonCount(0, 'employees');
    }

    public function test_valid_status_workflow_assignment_and_history_remain_consistent(): void
    {
        $item = $this->create();
        $item = $this->advanceStatus($item, 'arranging');
        $item = $this->patchJson($this->url('/'.$item['id'].'/assignment'), ['revision' => $item['revision'], 'interpreter_id' => $this->profile()])
            ->assertOk()->json('item');
        $item = $this->advanceStatus($item, 'confirmed');
        $this->getJson($this->url())->assertJsonPath('statistics.confirmed', 1);
        $item = $this->advanceStatus($item, 'completed');
        $this->assertSame(5, $item['revision']);
        $this->getJson($this->url('/'.$item['id'].'/history'))->assertOk()->assertJsonCount(5, 'events')
            ->assertJsonPath('events.0.actor_name', $this->manager->name);
        $this->getJson($this->url())->assertJsonPath('statistics.completed', 1)->assertJsonPath('statistics.confirmed', 0);
    }

    public function test_illegal_transitions_and_unassigned_confirmation_do_not_change_state(): void
    {
        $item = $this->create();
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => 1, 'status' => 'completed'])->assertConflict();
        $item = $this->advanceStatus($item, 'arranging');
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => $item['revision'], 'status' => 'confirmed'])->assertUnprocessable();
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'status' => 'arranging', 'revision' => 2]);
    }

    public function test_cancellation_requires_its_own_permission_and_reason_and_is_terminal(): void
    {
        $item = $this->create();
        $this->actingAs($this->fixtureUser('interpret-transition-only', ['case.view', 'interpretation.view', 'interpretation.transition']));
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => 1, 'status' => 'cancelled', 'cancellation_reason' => 'Synthetic reason'])->assertForbidden();
        $this->actingAs($this->manager);
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => 1, 'status' => 'cancelled'])->assertUnprocessable();
        $item = $this->advanceStatus($item, 'cancelled', ['cancellation_reason' => 'Synthetic reason']);
        $data = $this->payload(['revision' => $item['revision']]); unset($data['request_key']);
        $this->patchJson($this->url('/'.$item['id']), $data)->assertConflict();
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'cancellation_reason' => 'Synthetic reason']);
    }

    public function test_update_revision_prevents_lost_changes_and_double_status_submit(): void
    {
        $item = $this->create();
        $data = $this->payload(['revision' => 1, 'content' => 'Updated synthetic']); unset($data['request_key']);
        $this->patchJson($this->url('/'.$item['id']), $data)->assertOk()->assertJsonPath('item.revision', 2);
        $this->patchJson($this->url('/'.$item['id']), $data)->assertConflict();
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => 2, 'status' => 'arranging'])->assertOk();
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => 2, 'status' => 'arranging'])->assertConflict();
        $this->assertDatabaseCount('case_activities', 3);
    }

    public function test_overlap_denies_hidden_case_booking_without_exposing_metadata_and_boundaries_allow_adjacent(): void
    {
        $id = $this->profile();
        $hidden = $this->matter(); $hidden->forceFill(['is_confidential' => true])->save();
        InterpretationRequest::forceCreate(['case_file_id' => $hidden->id, 'interpreter_id' => $id, 'language' => 'SYNTHETIC_SECRET',
            'work_type' => 'court', 'mode' => 'online', 'content' => 'SYNTHETIC_SECRET_CONTENT',
            'starts_at' => '2026-12-10 00:00:00', 'ends_at' => '2026-12-10 01:00:00',
            'created_by_user_id' => $this->manager->id, 'updated_by_user_id' => $this->manager->id,
            'request_key' => (string) Str::uuid(), 'creation_hash' => str_repeat('a', 64)]);
        $data = $this->payload(['interpreter_id' => $id]);
        $this->postJson($this->url('/conflicts'), $data)->assertOk()->assertExactJson(['has_conflict' => true]);
        $response = $this->postJson($this->url(), $data)->assertConflict();
        $this->assertStringNotContainsString('SYNTHETIC_SECRET', $response->getContent());
        $this->assertStringNotContainsString((string) $hidden->title, $response->getContent());
        $this->create(['interpreter_id' => $id, 'starts_at' => '2026-12-10T10:00:00+09:00', 'ends_at' => '2026-12-10T11:00:00+09:00']);
    }

    public function test_reschedule_and_assignment_check_conflicts_without_partial_write(): void
    {
        $id = $this->profile();
        $this->create(['interpreter_id' => $id]);
        $item = $this->create(['interpreter_id' => $id, 'starts_at' => '2026-12-11T09:00:00+09:00', 'ends_at' => '2026-12-11T10:00:00+09:00']);
        $data = $this->payload(['revision' => 1]); unset($data['request_key']);
        $this->patchJson($this->url('/'.$item['id']), $data)->assertConflict();
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'starts_at' => '2026-12-11 00:00:00', 'revision' => 1]);
        $unassigned = $this->create();
        $this->patchJson($this->url('/'.$unassigned['id'].'/assignment'), ['revision' => 1, 'interpreter_id' => $id])->assertConflict();
    }

    public function test_inactive_profile_and_employee_are_not_assignable(): void
    {
        $id = $this->profile(); Interpreter::find($id)->forceFill(['is_active' => false])->save();
        $this->postJson($this->url(), $this->payload(['interpreter_id' => $id]))->assertUnprocessable();
        $this->getJson($this->url('/options'))->assertOk()->assertJsonCount(0, 'interpreters');
        $this->manager->employee->update(['status' => 'inactive']);
        $this->getJson($this->url())->assertUnauthorized();
    }

    public function test_nested_ids_confidential_scope_and_unknown_case_are_denied(): void
    {
        $item = $this->create(); $other = $this->matter();
        foreach (['/'.$item['id'], '/'.$item['id'].'/history'] as $suffix) $this->getJson($this->url($suffix, $other))->assertNotFound();
        $other->forceFill(['is_confidential' => true])->save();
        $this->getJson($this->url('', $other))->assertNotFound();
        $this->postJson($this->url('', $other), $this->payload())->assertNotFound();
        $this->getJson('/api/case-files/999999/interpretation-requests')->assertNotFound();
    }

    public function test_case_read_only_membership_cannot_mutate_despite_functional_permissions(): void
    {
        $this->case->forceFill(['is_confidential' => true])->save();
        DB::table('case_memberships')->insert(['case_file_id' => $this->case->id, 'user_id' => $this->manager->id,
            'employee_id' => $this->manager->employee_id, 'granted_by' => $this->fixtureUser('issuer', ['case.view'])->id,
            'can_read' => true, 'can_read_confidential' => true, 'can_write' => false,
            'expires_at' => now()->addDay(), 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->getJson($this->url())->assertOk()->assertJsonPath('capabilities.can_create', false);
        $this->postJson($this->url(), $this->payload())->assertForbidden();
    }

    public function test_cost_fields_never_appear_and_update_permission_does_not_imply_cost_access(): void
    {
        $item = $this->create();
        Schema::table('interpretation_requests', fn ($table) => $table->decimal('fee', 12, 2)->nullable());
        DB::table('interpretation_requests')->where('id', $item['id'])->update(['fee' => 12345]);
        $this->getJson($this->url())->assertOk()->assertJsonPath('capabilities.can_view_costs', false)->assertJsonMissingPath('items.0.fee');
        $this->getJson($this->url('/'.$item['id']))->assertOk()->assertJsonMissingPath('item.fee');
    }

    public function test_audit_failure_rolls_back_creation_and_state_and_profile(): void
    {
        $item = $this->create();
        $this->mock(CaseWorkspaceAuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Synthetic audit failure'));
        $this->postJson($this->url(), $this->payload())->assertStatus(500);
        $this->postJson($this->url('/'.$item['id'].'/status'), ['revision' => 1, 'status' => 'arranging'])->assertStatus(500);
        $this->postJson($this->url('/interpreters'), ['kind' => 'external', 'display_name' => 'Rollback', 'registration_key' => (string) Str::uuid()])->assertStatus(500);
        $this->assertDatabaseCount('interpretation_requests', 1);
        $this->assertDatabaseCount('interpreters', 0);
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'status' => 'pending', 'revision' => 1]);
        $this->assertDatabaseCount('case_activities', 1);
    }

    public function test_new_catalog_does_not_grant_legacy_level_or_admin_authority(): void
    {
        $legacy = $this->fixtureLegacy('interpret-legacy', 'level_5', 'admin');
        $this->actingAs($legacy);
        $this->getJson($this->url())->assertForbidden();
        $this->assertFalse($legacy->hasPermission('interpretation.create'));
        $this->assertDatabaseCount('interpretation_requests', 0);
    }

    public function test_revoked_capability_is_denied_on_next_request_without_changing_data(): void
    {
        $item = $this->create();
        $role = $this->manager->roles()->firstOrFail();
        $role->permissions()->detach(\App\Models\Permission::where('name', 'interpretation.update')->value('id'));
        $data = $this->payload(['revision' => 1]); unset($data['request_key']);
        $this->patchJson($this->url('/'.$item['id']), $data)->assertForbidden();
        $this->getJson($this->url())->assertOk()->assertJsonPath('capabilities.can_update', false);
        $this->assertDatabaseHas('interpretation_requests', ['id' => $item['id'], 'revision' => 1]);
    }

    public function test_cancellation_releases_reservation_but_retains_request_and_audit(): void
    {
        $id = $this->profile();
        $first = $this->create(['interpreter_id' => $id]);
        $this->advanceStatus($first, 'cancelled', ['cancellation_reason' => 'Synthetic release']);
        $this->create(['interpreter_id' => $id]);
        $this->assertDatabaseCount('interpretation_requests', 2);
        $this->assertDatabaseHas('interpretation_requests', ['id' => $first['id'], 'status' => 'cancelled']);
        $this->getJson($this->url('/'.$first['id'].'/history'))->assertOk()->assertJsonCount(2, 'events');
    }

    public function test_creator_without_assignment_permission_cannot_read_global_directory_names(): void
    {
        $this->profile();
        $this->actingAs($this->fixtureUser('interpret-create-only', ['case.view', 'interpretation.view', 'interpretation.create']));
        $this->getJson($this->url('/options'))->assertOk()->assertJsonCount(0, 'interpreters')->assertJsonCount(0, 'employees');
    }

    public function test_soft_deleted_internal_interpreter_keeps_historical_name_but_cannot_be_assigned_again(): void
    {
        $person = $this->fixtureUser('interpret-person', ['case.view']);
        $profile = $this->postJson($this->url('/interpreters'), ['kind' => 'employee', 'employee_id' => $person->employee_id,
            'registration_key' => (string) Str::uuid()])->assertCreated()->json('interpreter');
        $item = $this->create(['interpreter_id' => $profile['id']]);
        $person->employee->delete();
        $this->getJson($this->url('/'.$item['id']))->assertOk()->assertJsonPath('item.interpreter.name', $profile['name'])->assertJsonPath('item.interpreter.is_active', false);
        $this->postJson($this->url(), $this->payload(['interpreter_id' => $profile['id']]))->assertUnprocessable();
    }
}
