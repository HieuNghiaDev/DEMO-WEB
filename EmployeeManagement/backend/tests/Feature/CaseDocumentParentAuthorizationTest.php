<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\Permission;
use App\Policies\CaseFilePolicy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class CaseDocumentParentAuthorizationTest extends B21TestCase
{
    private const MARKERS = ['A01-private-case', 'A01-private-client', 'A01-private-document',
        'A01-private-note', 'A01-private-filename.pdf', 'A01-private-drive-id'];

    private function target(): array
    {
        $case = $this->matter();
        $case->update(['title' => self::MARKERS[0]]);
        $case->client->update(['name' => self::MARKERS[1]]);
        $document = $case->documents()->create([
            'category' => 'contract', 'title' => self::MARKERS[2], 'note' => self::MARKERS[3],
            'file_url' => 'https://example.test/'.self::MARKERS[5].'/'.self::MARKERS[4],
            'version' => '1', 'status' => 'draft',
        ]);

        // Compare persisted state including database defaults on both sides of a denied request.
        return [$case, $document->fresh()];
    }

    private function assertPrivateDenial(TestResponse $response, int $status = 403): void
    {
        $response->assertStatus($status);
        foreach (self::MARKERS as $marker) {
            $this->assertStringNotContainsString($marker, $response->getContent());
        }
    }

    public static function readMatrix(): array
    {
        return ['both' => [true, true, 200], 'document_only' => [true, false, 403],
            'parent_only' => [false, true, 403], 'neither' => [false, false, 403]];
    }

    #[DataProvider('readMatrix')]
    public function test_document_read_requires_both_functional_and_parent_authorization(bool $functional, bool $parent, int $expected): void
    {
        $actor = $this->fixtureUser('a01-reader', [...($functional ? ['document.view'] : []), ...($parent ? ['case.view'] : [])]);
        [$case, $document] = $this->target();
        $this->assertSame($parent, $case->isVisibleTo($actor));
        $response = $this->actingAs($actor)->getJson("/api/case-files/{$case->id}/documents");
        if ($expected === 200) {
            $response->assertOk()->assertJsonCount(1, 'documents')->assertJsonPath('documents.0.id', $document->id);
        } else {
            $this->assertPrivateDenial($response);
        }
    }

    public static function mutationMatrix(): array
    {
        $cases = [];
        foreach (['create', 'update', 'confirm', 'delete'] as $action) {
            foreach (self::readMatrix() as $label => [$functional, $parent]) {
                $cases[$action.'_'.$label] = [$action, $functional, $parent];
            }
        }

        return $cases;
    }

    private function permission(string $action): string
    {
        return 'document.'.match ($action) { 'create' => 'create', 'delete' => 'delete', default => 'update' };
    }

    private function mutate(string $action, CaseFile $case, CaseDocument $document): TestResponse
    {
        $url = "/api/case-files/{$case->id}/documents";

        return match ($action) {
            'create' => $this->postJson($url, ['category' => 'contract', 'title' => 'A01-new-document']),
            'update' => $this->patchJson($url."/{$document->id}", ['title' => 'A01-updated-document']),
            'confirm' => $this->patchJson($url."/{$document->id}", ['status' => 'confirmed']),
            'delete' => $this->deleteJson($url."/{$document->id}"),
        };
    }

    #[DataProvider('mutationMatrix')]
    public function test_legacy_writes_require_both_boundaries_without_partial_mutation(string $action, bool $functional, bool $parent): void
    {
        $actor = $this->fixtureUser('a01-writer', [...($functional ? [$this->permission($action)] : []), ...($parent ? ['case.view'] : [])]);
        [$case, $document] = $this->target();
        $before = $document->getAttributes();
        $this->actingAs($actor);
        $response = $this->mutate($action, $case, $document);
        if (! $functional || ! $parent) {
            $this->assertPrivateDenial($response);
            $this->assertEquals($before, $document->fresh()->getAttributes());
            $this->assertDatabaseCount('case_documents', 1);
            $this->assertDatabaseCount('case_activities', 0);

            return;
        }
        $response->assertStatus($action === 'create' ? 201 : 200);
        match ($action) {
            'create' => $response->assertJsonPath('document.created_by_employee_id', $actor->employee_id)->assertJsonPath('document.version', '1'),
            'update' => $response->assertJsonPath('document.title', 'A01-updated-document')->assertJsonPath('document.version', '2'),
            'confirm' => $response->assertJsonPath('document.confirmed_by_employee_id', $actor->employee_id),
            'delete' => $this->assertSoftDeleted('case_documents', ['id' => $document->id]),
        };
        $this->assertDatabaseCount('case_activities', 1);
    }

    public static function actions(): array
    {
        return [['create'], ['update'], ['confirm'], ['delete']];
    }

    #[DataProvider('actions')]
    public function test_guests_cannot_write_documents(string $action): void
    {
        [$case, $document] = $this->target();
        $this->assertPrivateDenial($this->mutate($action, $case, $document), 401);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_guest_cannot_list_documents(): void
    {
        [$case] = $this->target();
        $this->assertPrivateDenial($this->getJson("/api/case-files/{$case->id}/documents"), 401);
    }

    public static function nestedActions(): array
    {
        return [['update'], ['delete']];
    }

    #[DataProvider('nestedActions')]
    public function test_document_from_another_case_is_not_found_without_leaking_target(string $action): void
    {
        $actor = $this->fixtureUser('a01-nested', ['case.view', $this->permission($action)]);
        [$case, $document] = $this->target();
        $otherCase = $this->matter();
        $before = $document->getAttributes();
        $this->actingAs($actor);
        $this->assertPrivateDenial($this->mutate($action, $otherCase, $document), 404);
        $this->assertEquals($before, $document->fresh()->getAttributes());
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_list_respects_shared_policy_denial_even_with_both_permissions(): void
    {
        $actor = $this->fixtureUser('a01-policy-reader', ['document.view', 'case.view']);
        [$case] = $this->target();
        Gate::policy(CaseFile::class, DeniedA01CasePolicy::class);
        $this->assertPrivateDenial($this->actingAs($actor)->getJson("/api/case-files/{$case->id}/documents"));
    }

    #[DataProvider('actions')]
    public function test_writes_respect_shared_policy_denial_without_new_membership_rollout(string $action): void
    {
        $actor = $this->fixtureUser('a01-policy-writer', [$this->permission($action), 'case.view']);
        [$case, $document] = $this->target();
        Gate::policy(CaseFile::class, DeniedA01CasePolicy::class);
        $this->actingAs($actor);
        $this->assertPrivateDenial($this->mutate($action, $case, $document));
        $this->assertDatabaseHas('case_documents', ['id' => $document->id, 'status' => 'draft', 'deleted_at' => null]);
        $this->assertDatabaseCount('case_documents', 1);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_denied_list_does_not_query_the_document_collection_first(): void
    {
        $actor = $this->fixtureUser('a01-query', ['document.view']);
        [$case] = $this->target();
        $this->actingAs($actor);
        DB::enableQueryLog();
        DB::flushQueryLog();
        try {
            $response = $this->getJson("/api/case-files/{$case->id}/documents");
            $queries = DB::getQueryLog();
        } finally {
            DB::disableQueryLog();
        }
        $this->assertPrivateDenial($response);
        foreach ($queries as $query) {
            $this->assertDoesNotMatchRegularExpression('/\bfrom\s+["`]?case_documents\b/i', $query['query']);
        }
    }

    public function test_revoked_parent_permission_is_observed_on_the_next_request(): void
    {
        $actor = $this->fixtureUser('a01-revoke', ['case.view', 'document.view']);
        [$case] = $this->target();
        $this->actingAs($actor)->getJson("/api/case-files/{$case->id}/documents")->assertOk();
        $actor->load('roles.permissions');
        $actor->roles()->sole()->permissions()->detach(Permission::where('name', 'case.view')->sole()->id);
        $this->assertPrivateDenial($this->getJson("/api/case-files/{$case->id}/documents"));
    }

    public function test_existing_legacy_authorized_user_keeps_current_access(): void
    {
        $actor = $this->actor('a01-existing', 'level_5');
        [$case, $document] = $this->target();
        $this->actingAs($actor)->getJson("/api/case-files/{$case->id}/documents")
            ->assertOk()->assertJsonPath('documents.0.id', $document->id);
    }
}

/** Test-only narrower policy proves consumers use the shared parent boundary. */
class DeniedA01CasePolicy extends CaseFilePolicy
{
    public function view(\App\Models\User $user, CaseFile $case): bool
    {
        return false;
    }
}
