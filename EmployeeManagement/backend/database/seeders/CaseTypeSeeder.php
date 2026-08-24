<?php

namespace Database\Seeders;

use App\Models\CaseType;
use Illuminate\Database\Seeder;

class CaseTypeSeeder extends Seeder
{
    public function run(): void
    {
        collect([
            ['在留期間更新', 'ザイリュウキカンコウシン'],
            ['在留資格変更', 'ザイリュウシカクヘンコウ'],
            ['就労資格証明', 'シュウロウシカクショウメイ'],
            ['家族滞在', 'カゾクタイザイ'],
            ['労災事故', 'ロウサイジコ'],
            ['業務委託契約', 'ギョウムイタクケイヤク'],
            ['継続技能', 'ケイゾクギノウ'],
            ['離婚手続き', 'リコンテツヅキ'],
            ['融資手続き', 'ユウシテツヅキ'],
            ['その他', 'ソノタ'],
        ])->each(function (array $type, int $index): void {
            CaseType::query()->updateOrCreate(
                ['name' => $type[0]],
                ['name_kana' => $type[1], 'sort_order' => $index + 1, 'is_active' => true],
            );
        });
    }
}
