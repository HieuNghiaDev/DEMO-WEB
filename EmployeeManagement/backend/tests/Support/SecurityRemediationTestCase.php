<?php

namespace Tests\Support;

use App\Models\CaseFile;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

abstract class SecurityRemediationTestCase extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        // Fail before any migration, connection or transaction can touch project data.
        $this->assertSame('testing', app()->environment());
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->assertEmpty(config('database.connections.sqlite.url'));
    }

    protected function migrateDatabases(): void
    {
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Storage::fake('local');
        $this->seed(RolePermissionSeeder::class);
    }

    protected function actor(string $suffix, ?string $role): User
    {
        $office = Office::firstOrCreate(['office_code' => 'SEC-TEST'], [
            'name' => 'Synthetic security office', 'status' => 'active',
        ]);
        $employee = Employee::create([
            'employee_code' => 'SEC-'.$suffix, 'full_name' => 'Synthetic '.$suffix,
            'office_id' => $office->id, 'hire_date' => '2026-01-01', 'status' => 'active',
        ]);
        $user = User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'employee', 'is_active' => true,
            'must_change_password' => false, 'email' => 'sec-'.$suffix.'@example.test',
        ]);
        if ($role !== null) {
            $user->roles()->sync([Role::where('name', $role)->value('id')]);
        }

        return $user;
    }

    protected function matter(?Employee $employee = null): CaseFile
    {
        return CaseFile::create([
            'title' => 'Synthetic security case', 'status' => 'active',
            'client_id' => Client::create(['name' => 'Synthetic client'])->id,
            'assigned_employee_id' => $employee?->id,
            'created_by_employee_id' => $employee?->id,
        ]);
    }
}
