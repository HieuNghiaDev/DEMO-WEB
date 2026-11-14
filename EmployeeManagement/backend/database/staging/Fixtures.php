<?php

namespace Themis\Staging;

use App\Models\{CaseDocument, CaseFile, CaseTask, CaseType, Client, DocumentType, Employee, Office, Permission, Role, User};
use Illuminate\Support\Facades\{DB, Hash};
use LogicException;

/** Never a Laravel seeder or web binding. Invoked only by the admitted empty-target installer. */
final class Fixtures
{
    public static function apply(array $manifest): array
    {
        if (User::count() || Role::count() || Permission::count() || CaseFile::count()
            || DB::table('g6_synthetic_admission')->where('purpose', Target::PURPOSE)->count() !== 1) {
            throw new LogicException('Fixtures require an admitted new empty account/catalog state.');
        }
        return DB::transaction(function () use ($manifest): array {
            $office = Office::create(['office_code' => 'STG-G6', 'name' => 'SYNTHETIC G6 OFFICE', 'status' => 'active']);
            $users = []; $handover = [];
            foreach ($manifest['accounts'] as $label => $grants) {
                $employee = Employee::create(['employee_code' => 'G6-'.(count($users) + 1), 'full_name' => $label,
                    'office_id' => $office->id, 'hire_date' => '2026-01-01', 'status' => 'active']);
                $password = bin2hex(random_bytes(32));
                $user = User::forceCreate(['employee_id' => $employee->id, 'name' => $label, 'login_id' => $label,
                    'email' => strtolower($label).'@example.test', 'password' => Hash::make($password),
                    'role' => 'employee', 'is_active' => $label !== 'STG_INACTIVE_USER', 'must_change_password' => false,
                    'activation_required' => false, 'activated_at' => now(), 'pii_requires_explicit' => true]);
                $role = Role::create(['name' => strtolower($label), 'display_name' => $label]);
                foreach ($grants as $name) {
                    if (str_contains($name, 'legal') || str_contains($name, 'employee.') || str_contains($name, 'admin')) {
                        throw new LogicException('Synthetic operational fixtures cannot acquire protected authority.');
                    }
                    $permission = Permission::firstOrCreate(['name' => $name], ['display_name' => $name]);
                    DB::table('role_permissions')->insert(['role_id' => $role->id, 'permission_id' => $permission->id]);
                }
                DB::table('user_roles')->insert(['user_id' => $user->id, 'role_id' => $role->id]);
                $users[$label] = $user;
                $handover[$label] = $password;
            }
            $type = CaseType::create(['name' => 'SYNTHETIC G6 CASE TYPE', 'is_active' => true, 'sort_order' => 1]);
            $case = CaseFile::forceCreate(['title' => 'SYNTHETIC G6 NORMAL CASE', 'reference_number' => 'G6-NORMAL', 'case_type_id' => $type->id,
                'client_id' => Client::create(['name' => 'SYNTHETIC CLIENT G6'])->id,
                'status' => 'active', 'is_confidential' => false,
                'created_by_employee_id' => $users['STG_MANAGER']->employee_id]);
            foreach ($manifest['documents'] as $i => $code) {
                $type = DocumentType::create(['code' => $code, 'name_ja' => 'Synthetic document '.($i + 1),
                    'handling_type' => 'collected', 'document_group' => 'C', 'version' => 1, 'is_active' => true]);
                $doc = CaseDocument::create(['case_file_id' => $case->id, 'document_type_id' => $type->id,
                    'category' => '必要資料', 'title' => $type->name_ja, 'necessity_status' => 'required',
                    'requirement_level' => 'required', 'collection_status' => 'not_started', 'status' => 'not_requested']);
                CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $doc->id,
                    'title' => 'SYNTHETIC PRIVATE TASK '.($i + 1), 'description' => 'G6_PRIVATE_DESCRIPTION_'.($i + 1),
                    'assigned_employee_id' => $users[$i === 0 ? 'STG_ASSIGNED_STAFF' : 'STG_MANAGER']->employee_id,
                    'status' => 'unaccepted', 'due_at' => now()->addWeek()]);
            }
            foreach ($manifest['initial_counts'] as $table => $expected) {
                if (DB::table($table)->count() !== $expected) throw new LogicException('Synthetic fixture count mismatch.');
            }
            return $handover;
        });
    }
}
