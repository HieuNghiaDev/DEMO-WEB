<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_releases', function (Blueprint $table) {
            $table->id();
            $table->string('version', 32)->unique();
            $table->unsignedInteger('major');
            $table->unsignedInteger('minor');
            $table->unsignedInteger('patch');
            $table->string('codename', 80)->nullable();
            $table->string('release_type', 20);
            $table->string('title', 160);
            $table->json('release_notes');
            $table->timestamp('released_at');
            $table->foreignId('released_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('environment', 80);
            $table->string('build_sha', 80)->nullable();
            $table->string('build_number', 80)->nullable();
            $table->date('build_date')->nullable();
            $table->string('status', 20)->default('released');
            $table->timestamps();

            $table->index(['status', 'released_at']);
            $table->unique(['major', 'minor', 'patch']);
        });

        DB::table('app_releases')->insert([
            'version' => '0.11.0',
            'major' => 0,
            'minor' => 11,
            'patch' => 0,
            'codename' => 'KAI',
            'release_type' => 'minor',
            'title' => 'THEMIS UI・業務機能アップデート',
            'release_notes' => json_encode([
                'ui' => [
                    '案件詳細画面のUIを改善',
                    'モバイル表示・レスポンシブ対応を強化',
                    'ダークモードの表示品質を改善',
                ],
                'new_features' => [
                    '交通事故案件の関係先管理を強化',
                    '相手方企業・双方の保険会社の管理に対応',
                ],
                'improvements' => [
                    'AIクイックアシストのUIと操作性を改善',
                    'Footerのバージョン情報を改善',
                ],
                'bug_fixes' => [
                    '各種UIの軽微な表示不具合を修正',
                ],
            ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'released_at' => '2026-09-25 00:00:00',
            'released_by' => null,
            'environment' => 'Preview Build',
            'build_sha' => null,
            'build_number' => null,
            'build_date' => '2026-09-25',
            'status' => 'released',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $now = now();
        DB::table('permissions')->updateOrInsert(
            ['name' => 'developer.view'],
            ['display_name' => '開発者コンソールを閲覧', 'updated_at' => $now, 'created_at' => $now]
        );
        DB::table('permissions')->updateOrInsert(
            ['name' => 'developer.release.manage'],
            ['display_name' => 'アプリケーションリリースを管理', 'updated_at' => $now, 'created_at' => $now]
        );
        DB::table('roles')->updateOrInsert(
            ['name' => 'developer'],
            ['display_name' => '開発者', 'updated_at' => $now, 'created_at' => $now]
        );

        $developerRoleId = DB::table('roles')->where('name', 'developer')->value('id');
        $basePermissionIds = DB::table('role_permissions')
            ->join('roles', 'roles.id', '=', 'role_permissions.role_id')
            ->where('roles.name', 'level_2')
            ->pluck('role_permissions.permission_id');
        $developerPermissionIds = DB::table('permissions')
            ->whereIn('name', ['developer.view', 'developer.release.manage'])
            ->pluck('id');

        foreach ($basePermissionIds->merge($developerPermissionIds)->unique() as $permissionId) {
            DB::table('role_permissions')->updateOrInsert([
                'role_id' => $developerRoleId,
                'permission_id' => $permissionId,
            ]);
        }
    }

    public function down(): void
    {
        $developerRoleId = DB::table('roles')->where('name', 'developer')->value('id');
        $developerPermissionIds = DB::table('permissions')
            ->whereIn('name', ['developer.view', 'developer.release.manage'])
            ->pluck('id');

        if ($developerRoleId !== null) {
            DB::table('user_roles')->where('role_id', $developerRoleId)->delete();
            DB::table('role_permissions')->where('role_id', $developerRoleId)->delete();
            DB::table('roles')->where('id', $developerRoleId)->delete();
        }

        DB::table('role_permissions')->whereIn('permission_id', $developerPermissionIds)->delete();
        DB::table('permissions')->whereIn('id', $developerPermissionIds)->delete();
        Schema::dropIfExists('app_releases');
    }
};
