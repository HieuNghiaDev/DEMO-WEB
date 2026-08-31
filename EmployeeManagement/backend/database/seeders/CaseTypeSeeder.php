<?php

namespace Database\Seeders;

use App\Models\CaseType;
use Illuminate\Database\Seeder;

class CaseTypeSeeder extends Seeder
{
    public function run(): void
    {
        $groups = [
            '在留・入管' => ['在留期間更新', '在留資格変更', '就労資格証明', '家族滞在', '技能実習→特定技能1号', '留学→技術・人文知識・国際業務', '日本人の配偶者等', '永住許可', '継続技能'],
            '労災' => ['療養（業務災害・通勤災害）', '休業（補償）給付', '障害（補償）給付'],
            '交通事故' => ['傷害事故', '後遺障害', '死亡事故'],
            '労働問題' => ['不当解雇・雇止め', '未払賃金・未払残業代', 'ハラスメント'],
            '損害賠償' => ['損害賠償一般'],
            '業務委託契約' => [], '離婚手続き' => [], '融資手続き' => [], 'その他' => [],
        ];

        $order = 0;
        foreach ($groups as $name => $children) {
            $parent = CaseType::query()->updateOrCreate(['name' => $name], [
                'parent_id' => null, 'sort_order' => ++$order * 100, 'is_active' => true,
            ]);
            foreach ($children as $index => $child) {
                CaseType::query()->updateOrCreate(['name' => $child], [
                    'parent_id' => $parent->id, 'sort_order' => $index + 1,
                    'is_active' => $child !== '継続技能',
                ]);
            }
        }
        // Removing an existing obsolete category is an operator cleanup, not an automatic seed action.
    }
}
