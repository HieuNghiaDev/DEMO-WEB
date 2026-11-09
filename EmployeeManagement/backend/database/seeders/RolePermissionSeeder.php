<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/** Runtime catalog registration only: no roles, grants, account mapping or lifecycle writes. */
class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
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
            'task.manage' => 'タスクの担当者・期限・取消を管理',
            'task.review' => 'タスク提出物を確認・承認・差戻し',
            'case.view' => '案件を閲覧',
            'case.create' => '案件を登録',
            'case.update' => '案件を更新',
            'case.delete' => '案件を削除',
            'case.assign' => '案件を担当者へ割当',
            'case.manage_access' => '案件アクセス権のメタデータを管理',
            'document.view' => '資料を閲覧',
            'document.create' => '資料を登録',
            'document.update' => '資料を更新',
            'document.delete' => '資料を削除',
            'approval.submit' => '承認を申請',
            'approval.view' => '承認を閲覧',
            'approval.approve' => '承認を実行',
            'ai.use' => 'AIを利用',
            'developer.view' => '開発者コンソールを閲覧',
            'developer.release.manage' => 'アプリケーションリリースを管理',
        ];

        foreach ($permissions as $name => $displayName) {
            Permission::query()->firstOrCreate(['name' => $name], ['display_name' => $displayName]);
        }
    }
}
