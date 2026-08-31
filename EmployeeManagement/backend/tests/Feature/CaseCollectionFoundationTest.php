<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentType;
use App\Models\Employee;
use App\Models\Office;
use App\Models\ReceivedDocument;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CaseCollectionFoundationTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases()
    {
        // Build a disposable database additively, without invoking migrate:fresh.
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_document_master_has_stable_codes_and_safe_defaults_without_seed_data(): void
    {
        $this->assertDatabaseCount('document_types', 0);
        $type = DocumentType::create([
            'code' => 'TEST-RECEIPT', 'name_ja' => '領収書', 'name_vi' => 'Biên nhận',
            'document_group' => 'W', 'description' => 'Test definition',
        ])->fresh();

        $this->assertSame('W', $type->document_group);
        $this->assertSame(1, $type->version);
        $this->assertTrue($type->is_active);
        $this->assertSame('Biên nhận', $type->name_vi);
        $this->expectException(QueryException::class);
        DocumentType::create(['code' => $type->code, 'name_ja' => 'Duplicate']);
    }

    public function test_rule_and_collection_relationships_preserve_independent_status_axes(): void
    {
        $case = $this->caseFile();
        $type = $this->documentType();
        $prerequisite = $this->documentType('TEST-AUTHORIZATION');
        $rule = CaseTypeDocumentRule::create([
            'case_type_id' => $case->case_type_id, 'document_type_id' => $type->id,
            'prerequisite_document_type_id' => $prerequisite->id,
            'purpose_category' => 'proof', 'applicability_condition' => 'When applicable',
            'standard_source' => 'Employer', 'standard_target_person' => 'Client',
            'standard_period_rule' => 'Current year', 'preservation_priority' => true,
            'effective_from' => '2026-01-01', 'effective_to' => '2026-12-31',
        ])->fresh();
        $employee = $this->employee();
        $document = $this->checklist($case, [
            'document_type_id' => $type->id, 'case_type_document_rule_id' => $rule->id,
            'target_person' => 'Client', 'collection_source' => 'Employer',
            'target_period_from' => '2026-01-01', 'target_period_to' => '2026-12-31',
            'target_scope' => 'Annual record', 'necessity_reason' => 'Pending review',
            'necessity_decided_by_employee_id' => $employee->id,
            'necessity_decided_at' => '2026-08-31 10:00:00',
            'assigned_employee_id' => $employee->id, 'requested_at' => '2026-08-31 11:00:00',
            'response_deadline' => '2026-09-10 17:00:00',
            'collection_priority' => 'high', 'preservation_reason' => 'Keep original',
            'status' => 'confirmed', 'requirement_level' => 'required',
        ])->fresh();

        $this->assertSame('conditional', $rule->requirement_level);
        $this->assertSame('normal', $rule->priority_default);
        $this->assertTrue($rule->is_active);
        $this->assertTrue($rule->preservation_priority);
        $this->assertSame(1, $rule->version);
        $this->assertSame(0, $rule->sort_order);
        $this->assertSame('2026-01-01', $rule->effective_from->toDateString());
        $this->assertSame($case->case_type_id, $rule->caseType->id);
        $this->assertTrue($rule->documentType->is($type));
        $this->assertTrue($rule->prerequisiteDocumentType->is($prerequisite));
        $this->assertTrue($type->rules->sole()->is($rule));
        $this->assertTrue($rule->caseType->documentRules->sole()->is($rule));
        $this->assertTrue($rule->caseDocuments->sole()->is($document));
        $this->assertTrue($type->caseDocuments->sole()->is($document));
        $this->assertTrue($document->documentType->is($type));
        $this->assertTrue($document->collectionRule->is($rule));
        $this->assertTrue($document->assignedEmployee->is($employee));
        $this->assertTrue($document->necessityDecidedBy->is($employee));
        $this->assertSame('2026-12-31', $document->target_period_to->toDateString());
        $this->assertSame('2026-09-10 17:00:00', $document->response_deadline->toDateTimeString());
        $this->assertSame('undetermined', $document->necessity_status);
        $this->assertSame('not_started', $document->collection_status);
        $this->assertSame('undetermined', $document->fulfillment_status);
        $this->assertSame('unreviewed', $document->review_status);

        $document->update(['necessity_status' => 'not_required', 'collection_status' => 'received',
            'fulfillment_status' => 'satisfied_by_alternative', 'review_status' => 'returned']);
        $this->assertSame('confirmed', $document->fresh()->status);
        $this->assertSame('required', $document->requirement_level);
        $this->assertSame('returned', $document->review_status);
    }

    public function test_many_to_many_links_and_received_metadata_round_trip(): void
    {
        $case = $this->caseFile();
        $type = $this->documentType();
        $employee = $this->employee();
        $first = $this->checklist($case);
        $second = $this->checklist($case);
        $received = $this->received($case, [
            'document_type_id' => $type->id, 'registered_by_employee_id' => $employee->id,
            'original_filename' => 'receipt.pdf', 'storage_type' => 'google_drive',
            'external_url' => 'https://drive.google.com/file/d/test', 'version' => 2,
            'received_at' => '2026-08-31 10:00:00', 'expires_at' => '2027-08-31',
            'original_or_copy' => 'original', 'return_required' => true,
            'returned_at' => '2026-09-01 10:00:00', 'notes' => 'Registered by employee',
        ])->fresh();
        $another = $this->received($case)->fresh();
        $first->receivedDocuments()->attach($received, ['relationship_type' => 'primary']);
        $first->receivedDocuments()->attach($another, ['relationship_type' => 'supplement']);
        $received->caseDocuments()->attach($second, ['relationship_type' => 'alternative']);

        $this->assertCount(2, $first->receivedDocuments);
        $this->assertCount(2, $received->caseDocuments);
        $this->assertCount(2, $case->receivedDocuments);
        $this->assertTrue($type->receivedDocuments->sole()->is($received));
        $this->assertTrue($received->caseFile->is($case));
        $this->assertTrue($received->documentType->is($type));
        $this->assertTrue($received->registeredByEmployee->is($employee));
        $this->assertSame(2, $received->version);
        $this->assertSame(1, $another->version);
        $this->assertFalse($another->return_required);
        $this->assertTrue($received->return_required);
        $this->assertSame('2027-08-31', $received->expires_at->toDateString());
        $this->assertSame('2026-09-01 10:00:00', $received->returned_at->toDateTimeString());
        $pivot = $first->receivedDocuments()->findOrFail($received->id)->pivot;
        $this->assertSame('primary', $pivot->relationship_type);
        $this->assertNotNull($pivot->created_at);

        $received->delete();
        $this->assertSoftDeleted('received_documents', ['id' => $received->id]);
        $this->assertSame(1, $first->receivedDocuments()->count());
        $this->assertDatabaseCount('case_document_received_documents', 3);
        $received->restore();
        $this->assertSame(2, $first->receivedDocuments()->count());
        $second->delete();
        $this->assertSame(1, $received->caseDocuments()->count());
        $second->restore();
        $this->assertSame(2, $received->caseDocuments()->count());
    }

    public function test_duplicate_pivot_links_are_rejected(): void
    {
        $case = $this->caseFile();
        $document = $this->checklist($case);
        $received = $this->received($case);
        $document->receivedDocuments()->attach($received);
        $this->expectException(QueryException::class);
        $document->receivedDocuments()->attach($received);
    }

    public function test_legacy_document_api_keeps_url_status_and_version_behavior(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $user = User::factory()->create();
        $user->roles()->sync([Role::where('name', 'level_5')->value('id')]);
        $case = $this->caseFile();
        $url = 'https://drive.google.com/file/d/legacy';
        $document = $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case->id}/documents", [
            'title' => 'Legacy file', 'category' => 'Test', 'status' => 'confirmed', 'file_url' => $url,
        ])->assertCreated()->assertJsonPath('document.version', '1')->json('document');
        $id = $document['id'];
        $this->patchJson("/api/case-files/{$case->id}/documents/{$id}", ['status' => 'not_required'])
            ->assertOk()->assertJsonPath('document.version', '2')->assertJsonPath('document.file_url', $url);
        $this->getJson("/api/case-files/{$case->id}/workspace")
            ->assertOk()->assertJsonPath('case_file.documents.0.file_url', $url)
            ->assertJsonPath('case_file.documents.0.status', 'not_required')
            ->assertJsonPath('summary.documents_total', 0);
        $model = CaseDocument::findOrFail($id);
        $this->assertSame('undetermined', $model->necessity_status);
        $this->assertSame('not_started', $model->collection_status);
        $this->assertSame('undetermined', $model->fulfillment_status);
        $this->assertSame('unreviewed', $model->review_status);
        $this->assertNull($model->document_type_id);
        $this->assertNull($model->case_type_document_rule_id);
        $this->assertDatabaseCount('received_documents', 0);
        $this->assertDatabaseCount('case_document_received_documents', 0);
    }

    public function test_foreign_keys_reject_nonexistent_references(): void
    {
        $case = $this->caseFile();
        $type = $this->documentType();
        $document = $this->checklist($case);
        $received = $this->received($case);
        $invalid = 999999;
        $writes = [
            fn () => CaseTypeDocumentRule::create(['case_type_id' => $invalid, 'document_type_id' => $type->id]),
            fn () => CaseTypeDocumentRule::create(['case_type_id' => $case->case_type_id, 'document_type_id' => $invalid]),
            fn () => CaseTypeDocumentRule::create(['case_type_id' => $case->case_type_id, 'document_type_id' => $type->id, 'prerequisite_document_type_id' => $invalid]),
            fn () => $this->received($case, ['case_file_id' => $invalid]),
            fn () => $this->received($case, ['document_type_id' => $invalid]),
            fn () => $this->received($case, ['registered_by_employee_id' => $invalid]),
            fn () => $document->receivedDocuments()->attach($invalid),
            fn () => $received->caseDocuments()->attach($invalid),
        ];
        foreach (['document_type_id', 'case_type_document_rule_id', 'assigned_employee_id', 'necessity_decided_by_employee_id'] as $column) {
            $writes[] = fn () => $this->checklist($case, [$column => $invalid]);
        }
        foreach ($writes as $write) {
            try {
                $write();
                $this->fail('A nonexistent foreign key was accepted.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('FOREIGN KEY constraint failed', $exception->getMessage());
            }
        }
    }

    public function test_nullable_foreign_keys_preserve_case_documents_and_received_files(): void
    {
        $case = $this->caseFile();
        $type = $this->documentType();
        $prerequisite = $this->documentType('AUTH');
        $employee = $this->employee();
        $rule = CaseTypeDocumentRule::create(['case_type_id' => $case->case_type_id,
            'document_type_id' => $type->id, 'prerequisite_document_type_id' => $prerequisite->id]);
        $document = $this->checklist($case, ['document_type_id' => $type->id,
            'case_type_document_rule_id' => $rule->id, 'assigned_employee_id' => $employee->id,
            'necessity_decided_by_employee_id' => $employee->id]);
        $received = $this->received($case, ['document_type_id' => $type->id, 'registered_by_employee_id' => $employee->id]);

        $prerequisite->delete();
        $this->assertNull($rule->fresh()->prerequisite_document_type_id);
        $rule->delete();
        $type->delete();
        $employee->forceDelete();
        $document->refresh();
        $received->refresh();
        $this->assertNull($document->document_type_id);
        $this->assertNull($document->case_type_document_rule_id);
        $this->assertNull($document->assigned_employee_id);
        $this->assertNull($document->necessity_decided_by_employee_id);
        $this->assertNull($received->document_type_id);
        $this->assertNull($received->registered_by_employee_id);
        $this->assertDatabaseCount('case_documents', 1);
        $this->assertDatabaseCount('received_documents', 1);
    }

    public function test_rule_master_references_are_restricted_on_hard_delete(): void
    {
        $caseType = CaseType::create(['name' => 'Test type']);
        $type = $this->documentType();
        CaseTypeDocumentRule::create(['case_type_id' => $caseType->id, 'document_type_id' => $type->id]);
        foreach ([$caseType, $type] as $master) {
            try {
                $master->delete();
                $this->fail('A referenced master was deleted.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('FOREIGN KEY constraint failed', $exception->getMessage());
            }
        }
    }

    public function test_hard_delete_cleans_pivot_links_and_case_soft_delete_keeps_received_data(): void
    {
        $case = $this->caseFile();
        $document = $this->checklist($case);
        $received = $this->received($case);
        $document->receivedDocuments()->attach($received);
        $case->delete();
        $this->assertDatabaseCount('received_documents', 1);
        $this->assertDatabaseCount('case_document_received_documents', 1);
        $case->restore();
        $received->forceDelete();
        $this->assertDatabaseCount('case_document_received_documents', 0);
        $received = $this->received($case);
        $document->receivedDocuments()->attach($received);
        $document->forceDelete();
        $this->assertDatabaseCount('case_document_received_documents', 0);
        $this->assertDatabaseCount('received_documents', 1);
        $case->forceDelete();
        $this->assertDatabaseCount('received_documents', 0);
    }

    private function caseFile(): CaseFile
    {
        return CaseFile::create([
            'client_id' => Client::create(['name' => 'Foundation Client'])->id,
            'case_type_id' => CaseType::create(['name' => 'Foundation case type'])->id,
            'title' => 'Foundation case',
        ]);
    }

    private function documentType(string $code = 'TEST-RECEIPT'): DocumentType
    {
        return DocumentType::create(['code' => $code, 'name_ja' => 'Test document']);
    }

    private function checklist(CaseFile $case, array $attributes = []): CaseDocument
    {
        return $case->documents()->create(['title' => 'Checklist item', 'category' => 'Test', ...$attributes]);
    }

    private function received(CaseFile $case, array $attributes = []): ReceivedDocument
    {
        return ReceivedDocument::create(['case_file_id' => $case->id, 'title' => 'Received file',
            'storage_type' => 'external_link', ...$attributes]);
    }

    private function employee(): Employee
    {
        $office = Office::create(['office_code' => 'FOUNDATION', 'name' => 'Foundation office']);

        return Employee::create(['employee_code' => 'FOUNDATION', 'full_name' => 'Test Employee',
            'hire_date' => '2026-01-01', 'office_id' => $office->id]);
    }
}
