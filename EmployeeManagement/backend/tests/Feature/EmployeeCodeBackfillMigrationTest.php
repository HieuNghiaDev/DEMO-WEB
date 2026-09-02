<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Database\Seeders\OfficeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeCodeBackfillMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_normalizes_legacy_employee_codes_and_only_syncs_mirrored_login_ids(): void
    {
        $this->seed(OfficeSeeder::class);
        $themis = Office::query()->where('office_code', 'THEMIS')->sole();
        $lawOffice = Office::query()->where('office_code', 'CHUKA_LAW')->sole();

        $firstThemisEmployee = $this->legacyEmployee($themis, 'TM001', '2026-08-10 10:00:00');
        $secondThemisEmployee = $this->legacyEmployee($themis, 'TM-MGR001', '2026-08-11 10:00:00');
        $lawEmployee = $this->legacyEmployee($lawOffice, 'LW001', '2026-08-12 10:00:00');

        $mirroredUser = User::factory()->create([
            'employee_id' => $firstThemisEmployee->id,
            'login_id' => 'TM001',
        ]);
        $independentLoginUser = User::factory()->create([
            'employee_id' => $secondThemisEmployee->id,
            'login_id' => 'manager-email-login',
        ]);

        $migration = require database_path('migrations/2026_09_02_130000_backfill_existing_employee_codes.php');
        $migration->up();

        $this->assertSame('TMS-26001', $firstThemisEmployee->fresh()->employee_code);
        $this->assertSame('TMS-26002', $secondThemisEmployee->fresh()->employee_code);
        $this->assertSame('TLW-26001', $lawEmployee->fresh()->employee_code);
        $this->assertSame('TMS-26001', $mirroredUser->fresh()->login_id);
        $this->assertSame('manager-email-login', $independentLoginUser->fresh()->login_id);
        $this->assertDatabaseHas('employee_code_sequences', [
            'office_id' => $themis->id,
            'sequence_year' => 2026,
            'last_sequence' => 2,
        ]);
        $this->assertDatabaseHas('employee_code_sequences', [
            'office_id' => $lawOffice->id,
            'sequence_year' => 2026,
            'last_sequence' => 1,
        ]);
    }

    private function legacyEmployee(Office $office, string $code, string $createdAt): Employee
    {
        return Employee::query()->create([
            'employee_code' => $code,
            'full_name' => "Legacy {$code}",
            'office_id' => $office->id,
            'hire_date' => '2026-08-01',
            'status' => 'active',
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);
    }
}
