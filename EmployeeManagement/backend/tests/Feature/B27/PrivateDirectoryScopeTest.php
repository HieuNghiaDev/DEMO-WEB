<?php

namespace Tests\Feature\B27;

use App\Models\Employee;
use App\Models\User;
use App\Policies\EmployeePolicy;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class PrivateDirectoryScopeTest extends B21TestCase
{
    public static function readerKinds(): array
    {
        return [['explicit'], ['legacy_bridge']];
    }

    #[DataProvider('readerKinds')]
    public function test_actor_wide_directory_check_does_not_bypass_subject_restrictions(string $kind): void
    {
        $reader = $kind === 'explicit'
            ? $this->fixtureUser('scoped-reader', ['employee.view', 'employee.view_private'])
            : $this->fixtureLegacy('scoped-legacy', 'level_4');
        $allowed = $this->fixtureEmployee('permitted-target')->employee;
        $denied = $this->fixtureEmployee('restricted-target')->employee;
        foreach ([$allowed, $denied] as $target) {
            $target->update(['phone' => 'SYNTHETIC', 'date_of_birth' => '1990-01-01', 'nationality_code' => 'XX']);
        }
        // Synthetic future per-subject HR policy, not a production scope/mapping decision.
        $policy = new SubjectRestrictedEmployeePolicy([$allowed->id]);
        $this->app->instance(SubjectRestrictedEmployeePolicy::class, $policy);
        Gate::policy(Employee::class, SubjectRestrictedEmployeePolicy::class);
        $rows = collect($this->actingAs($reader, 'sanctum')->getJson('/api/organization')->assertOk()->json('employees'));
        $this->assertNotNull($rows->firstWhere('id', $denied->id), 'Operational identity remains visible.');
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
            $this->assertSame($kind === 'explicit'
                ? ($allowed->{$field} instanceof \DateTimeInterface ? '1990-01-01' : $allowed->{$field})
                : null, $rows->firstWhere('id', $allowed->id)[$field]);
            $this->assertNull($rows->firstWhere('id', $denied->id)[$field]);
        }
        if ($kind === 'explicit') {
            $this->assertTrue(Gate::forUser($reader)->allows('viewPrivate', $allowed));
        } else {
            $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $allowed));
        }
        $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $denied));
    }
}

/** Test-only future subject policy; no production office/HR mapping is invented. */
class SubjectRestrictedEmployeePolicy extends EmployeePolicy
{
    public function __construct(private array $allowedIds)
    {
        \App\Services\Administration\LocalAdministrationSandbox::requireMemoryDatabase();
    }

    public function viewPrivateSubject(User $actor, Employee $employee): bool
    {
        // A fake, exact subject approval to exercise composition, never a runtime HR admission.
        return ! $employee->trashed() && in_array($employee->id, $this->allowedIds, true);
    }
}
