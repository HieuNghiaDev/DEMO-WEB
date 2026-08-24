<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            'level_1' => 'レベル 1',
            'level_2' => 'レベル 2',
            'level_3' => 'レベル 3',
            'level_4' => 'レベル 4',
            'level_5' => 'レベル 5',
        ];

        $permissions = [
            'employee.view' => '社員情報を閲覧',
            'employee.create' => '社員を登録',
            'employee.update' => '社員を更新',
            'employee.disable' => '社員を無効化',
            'employee.manage_roles' => '社員権限を管理',
            'attendance.view_own' => '自分の勤怠を閲覧',
            'attendance.view_all' => '全員の勤怠を閲覧',
            'attendance.update_own' => '自分の勤怠を更新',
            'attendance.update_all' => '全員の勤怠を更新',
            'attendance.export_own' => '自分の勤怠を出力',
            'attendance.export_all' => '全員の勤怠を出力',
            'task.view_own' => '自分の業務を閲覧',
            'task.view_all' => '全業務を閲覧',
            'task.create' => '業務を作成',
            'task.assign' => '業務を依頼',
            'task.update' => '業務を更新',
            'task.delete' => '業務を削除',
            'case.view' => '案件を閲覧',
            'case.create' => '案件を登録',
            'case.update' => '案件を更新',
            'case.delete' => '案件を削除',
            'case.assign' => '案件を担当者へ割当',
            'document.view' => '資料を閲覧',
            'document.create' => '資料を登録',
            'document.update' => '資料を更新',
            'document.delete' => '資料を削除',
            'approval.submit' => '承認を申請',
            'approval.view' => '承認を閲覧',
            'approval.approve' => '承認を実行',
            'ai.use' => 'AIを利用',
        ];

        $roleModels = collect($roles)->mapWithKeys(
            fn (string $displayName, string $name) => [
                $name => Role::query()->updateOrCreate(
                    ['name' => $name],
                    ['display_name' => $displayName]
                ),
            ]
        );

        $permissionModels = collect($permissions)->mapWithKeys(
            fn (string $displayName, string $name) => [
                $name => Permission::query()->firstOrCreate(
                    ['name' => $name],
                    ['display_name' => $displayName]
                ),
            ]
        );

        $allPermissions = $permissionModels->pluck('id')->all();
        $rolePermissions = [
            'level_1' => [
                'employee.view', 'attendance.view_own', 'attendance.update_own',
                'task.view_own', 'task.update', 'case.view', 'document.view',
            ],
            'level_2' => [
                'employee.view', 'attendance.view_own', 'attendance.update_own',
                'attendance.export_own', 'task.view_own', 'task.update',
                'case.view', 'document.view', 'document.update', 'ai.use',
            ],
            'level_3' => [
                'employee.view', 'attendance.view_own', 'attendance.update_own',
                'attendance.export_own', 'task.view_own', 'task.view_all',
                'task.create', 'task.assign', 'task.update', 'case.view',
                'case.create', 'case.update', 'document.view',
                'document.create', 'document.update', 'ai.use',
            ],
            'level_4' => [
                'employee.view', 'employee.create', 'employee.update',
                'employee.disable', 'employee.manage_roles',
                'attendance.view_own', 'attendance.view_all',
                'attendance.update_own', 'attendance.update_all',
                'attendance.export_own', 'attendance.export_all',
                'task.view_own', 'task.view_all', 'task.create', 'task.assign',
                'task.update', 'task.delete', 'case.view', 'case.create',
                'case.update', 'case.delete', 'case.assign', 'document.view',
                'document.create', 'document.update', 'document.delete',
                'approval.submit', 'approval.view', 'approval.approve', 'ai.use',
            ],
            'level_5' => $allPermissions,
        ];

        foreach ($rolePermissions as $roleName => $permissionNames) {
            $ids = $roleName === 'level_5'
                ? $allPermissions
                : $permissionModels->only($permissionNames)->pluck('id')->all();
            $roleModels[$roleName]->permissions()->sync($ids);
        }

        User::query()->with('roles')->each(function (User $user) use ($roleModels): void {
            if ($user->roles->isNotEmpty()) {
                return;
            }

            $legacyRole = match ($user->role) {
                'admin' => 'level_5',
                'manager' => 'level_4',
                'lawyer' => 'level_3',
                'part_time' => 'level_1',
                default => 'level_2',
            };

            $user->roles()->syncWithoutDetaching([$roleModels[$legacyRole]->id]);
        });
    }
}
