<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class TaskWorkflowPermissionSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            'task.manage' => 'タスクの担当者・期限・取消を管理',
            'task.review' => 'タスク提出物を確認・承認・差戻し',
        ] as $name => $displayName) {
            Permission::query()->firstOrCreate(['name' => $name], ['display_name' => $displayName]);
        }
    }
}
