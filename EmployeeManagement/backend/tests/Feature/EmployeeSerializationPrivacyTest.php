<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\Employee;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\SecurityRemediationTestCase;

class EmployeeSerializationPrivacyTest extends SecurityRemediationTestCase
{
    private const PRIVATE_FIELDS = [
        'phone', 'date_of_birth', 'nationality_code', 'termination_date',
        'avatar_data', 'avatar_token',
    ];

    private function subject(): Employee
    {
        $employee = $this->actor('subject', 'level_2')->employee;
        $employee->update([
            'phone' => 'SYNTHETIC-PRIVATE-PHONE', 'date_of_birth' => '2000-01-01',
            'nationality_code' => 'ZZ', 'termination_date' => '2030-01-01',
            'full_name_kana' => 'テスト', 'gender' => 'other', 'position_title' => 'Synthetic staff',
            'work_email' => 'synthetic-staff@example.test', 'employment_type' => 'full_time',
            'avatar_path' => '/synthetic-avatar.png',
        ]);

        return $employee->fresh();
    }

    private function assertSummary(array $data, Employee $employee): void
    {
        $this->assertSame($employee->id, $data['id']);
        $this->assertSame($employee->full_name, $data['full_name']);
        foreach (self::PRIVATE_FIELDS as $field) {
            $this->assertArrayNotHasKey($field, $data, 'Leaked Employee field: '.$field);
        }
    }

    public function test_raw_employee_serialization_is_safe_even_without_request_context(): void
    {
        $employee = $this->subject();
        // Future DB columns/accessors must be opt-in, not silently published.
        $employee->setAttribute('future_private_field', 'SYNTHETIC-PRIVATE');
        $this->assertSummary($employee->toArray(), $employee);
        $this->assertArrayNotHasKey('future_private_field', $employee->toArray());
        $this->assertSame('SYNTHETIC-PRIVATE-PHONE', $employee->phone);
        $this->assertSame('ZZ', $employee->nationality_code);
        $this->assertSame('2000-01-01', $employee->date_of_birth->toDateString());
        $this->assertDatabaseHas('employees', [
            'id' => $employee->id, 'phone' => 'SYNTHETIC-PRIVATE-PHONE', 'nationality_code' => 'ZZ',
        ]);
    }

    public static function employeeRelations(): array
    {
        return [
            [\App\Models\User::class, 'employee'],
            [\App\Models\Attendance::class, 'employee'],
            [\App\Models\EmployeeTask::class, 'employee'],
            [\App\Models\CaseTask::class, 'assignedEmployee'],
            [\App\Models\CasePrecedent::class, 'createdByEmployee'],
            [\App\Models\CaseDocument::class, 'confirmedByEmployee'],
            [\App\Models\ReceivedDocument::class, 'registeredByEmployee'],
            [\App\Models\CaseMeetingLog::class, 'createdByEmployee'],
            [\App\Models\CaseCustomSection::class, 'createdByEmployee'],
            [\App\Models\CaseActivity::class, 'createdByEmployee'],
        ];
    }

    #[DataProvider('employeeRelations')]
    public function test_nested_models_cannot_bypass_the_employee_summary(string $modelClass, string $relation): void
    {
        $employee = $this->subject();
        $parent = new $modelClass;
        if ($parent instanceof \App\Models\CaseTask) {
            $parent->status = 'pending';
        }
        $parent->setRelation($relation, $employee);
        $data = json_decode($parent->toJson(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSummary($data[\Illuminate\Support\Str::snake($relation)], $employee);
    }

    public static function caseEndpoints(): array
    {
        return [
            'list' => ['/api/case-files', 'case_files.0', ['assigned_employee', 'created_by_employee']],
            'detail' => ['/api/case-files/{id}', 'case_file', [
                'assigned_employee', 'created_by_employee', 'documents.0.created_by_employee',
                'precedents.0.created_by_employee', 'meeting_logs.0.created_by_employee',
                'custom_sections.0.created_by_employee', 'activities.0.created_by_employee',
            ]],
            'workspace' => ['/api/case-files/{id}/workspace', 'case_file', [
                'assigned_employee', 'created_by_employee', 'documents.0.created_by_employee',
                'documents.0.confirmed_by_employee', 'activities.0.created_by_employee',
            ]],
        ];
    }

    private function populateCase(Employee $employee): CaseFile
    {
        $case = $this->matter($employee);
        $case->documents()->create([
            'title' => 'Synthetic document', 'category' => 'Synthetic',
            'created_by_employee_id' => $employee->id, 'confirmed_by_employee_id' => $employee->id,
        ]);
        $case->precedents()->create(['title' => 'Synthetic precedent', 'created_by_employee_id' => $employee->id]);
        $case->meetingLogs()->create([
            'meeting_date' => '2026-01-01', 'interaction_type' => 'meeting',
            'content' => 'Synthetic meeting', 'created_by_employee_id' => $employee->id,
        ]);
        $case->customSections()->create(['title' => 'Synthetic section', 'created_by_employee_id' => $employee->id]);
        $case->activities()->create([
            'title' => 'Synthetic activity', 'activity_type' => 'note', 'channel' => 'internal',
            'occurred_at' => now(), 'created_by_employee_id' => $employee->id,
        ]);

        return $case;
    }

    #[DataProvider('caseEndpoints')]
    public function test_case_endpoints_redact_every_loaded_employee_relation(string $uri, string $root, array $paths): void
    {
        $actor = $this->actor('reader', 'level_1');
        $this->assertFalse($actor->hasPermission('employee.update'));
        $employee = $this->subject();
        $case = $this->populateCase($employee);
        Sanctum::actingAs($actor);
        $response = $this->getJson(str_replace('{id}', (string) $case->id, $uri))->assertOk();
        foreach ($paths as $path) {
            $this->assertSummary($response->json($root.'.'.$path), $employee);
        }
    }

    public function test_own_profile_does_not_implicitly_grant_private_profile_permission(): void
    {
        $employee = $this->subject();
        Sanctum::actingAs($employee->user);
        $response = $this->getJson('/api/me')->assertOk();
        $this->assertSummary($response->json('user.employee'), $employee);
        foreach (['employee_code', 'full_name_kana', 'gender', 'office_id', 'hire_date',
            'position_title', 'work_email', 'employment_type', 'avatar_path', 'status'] as $field) {
            $this->assertArrayHasKey($field, $response->json('user.employee'));
        }
        $this->assertSame($employee->office_id, $response->json('user.employee.office.id'));
    }

    public function test_login_response_preserves_identity_but_not_private_profile_fields(): void
    {
        $employee = $this->subject();
        $response = $this->postJson('/api/login', [
            'email' => $employee->user->email, 'password' => 'password',
        ])->assertOk();
        $this->assertSummary($response->json('user.employee'), $employee);
        $this->assertNotEmpty($response->json('token'));
    }

    public function test_case_write_responses_also_redact_creator_and_assignee(): void
    {
        Sanctum::actingAs($this->actor('manager', 'level_4'));
        $employee = $this->subject();
        $case = $this->matter($employee);
        foreach ([
            ["/api/case-files/{$case->id}", ['title' => 'Synthetic updated case']],
            ["/api/case-files/{$case->id}/assignee", ['assigned_employee_id' => $employee->id]],
        ] as [$uri, $data]) {
            $response = $this->patchJson($uri, $data)->assertOk();
            foreach (['assigned_employee', 'created_by_employee'] as $relation) {
                $this->assertSummary($response->json('case_file.'.$relation), $employee);
            }
        }
    }

    public function test_organization_work_readers_and_editors_do_not_receive_private_fields(): void
    {
        $reader = $this->actor('reader', 'level_1');
        $manager = $this->actor('manager', 'level_4');
        $employee = $this->subject();
        Sanctum::actingAs($reader);
        $data = collect($this->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $employee->id);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
            $this->assertNull($data[$field]);
        }

        Sanctum::actingAs($manager);
        $data = collect($this->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $employee->id);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
            $this->assertNull($data[$field]);
        }
        $this->assertSame($employee->full_name, $data['full_name']);
    }

    public function test_manager_case_relations_are_still_summaries_not_private_profiles(): void
    {
        Sanctum::actingAs($this->actor('manager', 'level_4'));
        $employee = $this->subject();
        $case = $this->matter($employee);
        $this->assertSummary($this->getJson("/api/case-files/{$case->id}")->assertOk()->json('case_file.assigned_employee'), $employee);
    }

    public function test_guest_and_unprivileged_account_cannot_read_employee_or_case_directory(): void
    {
        $case = $this->matter();
        foreach (['/api/organization', '/api/me', '/api/case-files', "/api/case-files/{$case->id}/workspace"] as $uri) {
            $this->getJson($uri)->assertUnauthorized();
        }
        Sanctum::actingAs($this->actor('no-role', null));
        foreach (['/api/organization', '/api/case-files', "/api/case-files/{$case->id}/workspace"] as $uri) {
            $this->getJson($uri)->assertForbidden();
        }
    }
}
