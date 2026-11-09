<?php

namespace Tests\Feature\C001;

use App\Services\C001EngineValidationScope;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

/** These tests never connect to MariaDB. Operational evidence remains in the dedicated engine harness. */
class EngineValidationBoundaryTest extends B21TestCase
{
    public static function unsafeNames(): array
    {
        return array_map(fn ($name) => [$name], ['employee_management', 'EMPLOYEE_MANAGEMENT', 'mysql',
            'employee_management_test', 'employee_management_c001_engine_test_20261028_094108_bad',
            'employee_management_c001_engine_test_20261028_094108_abcdef01;DROP DATABASE mysql']);
    }

    #[DataProvider('unsafeNames')]
    public function test_source_or_unproven_database_is_never_admitted(string $name): void
    {
        $this->expectException(\LogicException::class);
        C001EngineValidationScope::assertName($name);
    }

    public function test_even_a_valid_disposable_name_cannot_be_an_ordinary_configured_database(): void
    {
        $name = 'employee_management_c001_engine_test_20261028_094108_abcdef01';
        $this->expectException(\LogicException::class);
        C001EngineValidationScope::assertName($name, [$name]);
    }

    public function test_marker_capability_cannot_be_issued_on_the_ordinary_memory_connection(): void
    {
        $this->expectException(\LogicException::class);
        C001EngineValidationScope::admit('employee_management_c001_engine_test_20261028_094108_abcdef01', str_repeat('a', 64), ['employee_management']);
    }

    public function test_application_never_binds_engine_admission_and_legal_gate_stays_pending(): void
    {
        $this->assertFalse(app()->bound(C001EngineValidationScope::class));
        $this->assertInstanceOf(\App\Services\PendingC001AuthorityPolicy::class, app(\App\Contracts\C001AuthorityPolicy::class));
        $this->assertTrue(\App\Services\LegalFinalizationGate::policyPending());
    }
}
