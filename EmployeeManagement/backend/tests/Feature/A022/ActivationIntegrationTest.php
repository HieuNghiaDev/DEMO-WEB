<?php

namespace Tests\Feature\A022;

use Illuminate\Support\Facades\Schema;
use Tests\Support\B21\B21TestCase;

class ActivationIntegrationTest extends B21TestCase
{
    public function test_new_case_without_classification_is_unknown_and_creator_assignment_cannot_open_it(): void
    {
        // Match the activated staging default in isolated SQLite, without changing create-case code.
        Schema::table('case_files', fn ($table) => $table->dropColumn('is_confidential'));
        Schema::table('case_files', fn ($table) => $table->boolean('is_confidential')->nullable());
        $user = $this->fixtureUser('a023-new-case', ['case.view', 'case.create', 'case.update', 'document.view']);
        $case = $this->matter($user->employee);
        $this->assertNull($case->fresh()->getRawOriginal('is_confidential'));
        $this->assertSame($user->employee_id, $case->assigned_employee_id);
        $this->assertSame($user->employee_id, $case->created_by_employee_id);
        $this->actingAs($user)->getJson('/api/case-files')->assertOk()->assertJsonCount(0, 'case_files');
        $this->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $this->getJson('/api/case-files/'.$case->id.'/workspace')->assertNotFound();
        $this->getJson('/api/case-files/'.$case->id.'/documents')->assertForbidden();
        $this->assertDatabaseCount('case_memberships', 0);
        $this->assertNull($case->fresh()->getRawOriginal('is_confidential'));
    }
}
