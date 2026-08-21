<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var array<string, array{0: string, 1: string}> */
    private array $levels = [
        'part_time' => ['level_1', 'レベル 1'],
        'staff' => ['level_2', 'レベル 2'],
        'lawyer' => ['level_3', 'レベル 3'],
        'manager' => ['level_4', 'レベル 4'],
        'super_admin' => ['level_5', 'レベル 5'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('roles')) {
            return;
        }

        foreach ($this->levels as $oldName => [$levelName, $displayName]) {
            DB::table('roles')
                ->where('name', $oldName)
                ->update([
                    'name' => $levelName,
                    'display_name' => $displayName,
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('roles')) {
            return;
        }

        foreach (array_reverse($this->levels, true) as $oldName => [$levelName, $displayName]) {
            DB::table('roles')
                ->where('name', $levelName)
                ->update([
                    'name' => $oldName,
                    'display_name' => match ($oldName) {
                        'super_admin' => 'システム管理者',
                        'manager' => '管理者',
                        'lawyer' => '弁護士',
                        'staff' => '正社員',
                        default => 'アルバイト',
                    },
                    'updated_at' => now(),
                ]);
        }
    }
};
