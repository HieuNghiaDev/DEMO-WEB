<?php

namespace Database\Seeders;

use App\Models\DocumentPurpose;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DocumentPurposeSeeder extends Seeder
{
    public function run(): void
    {
        // Exact headings (without numbering) from 事件類型別 資料収集マスター,
        // v1.0, 2026-08-30. Source checksum is recorded in document_type_master_v1.json.
        $purposes = [
            'COMMON' => '事件共通の資料',
            'W1' => '契約内容・労働条件の確認',
            'W2' => '事故態様・会社等の責任の検討',
            'W3' => '損害内容・労災給付の確認',
            'W4' => '第三者機関からの資料取得・審査請求に必要な書類',
            'W5' => '労基署・警察署への告訴・告発に関する書類',
            'T1' => '事故の発生・態様・責任関係の確認',
            'T2' => '人身損害の確認',
            'T3' => '物的損害の確認',
            'T4' => '保険・既払金・交渉経過の確認',
            'T5' => '資料取得に必要な書類',
        ];

        DB::transaction(function () use ($purposes): void {
            $order = 0;
            foreach ($purposes as $code => $name) {
                DocumentPurpose::query()->updateOrCreate(['code' => $code], [
                    'name_ja' => $name, 'sort_order' => ++$order, 'is_active' => true,
                ]);
            }
        });

        $this->command?->info('11 official document purposes seeded (master v1.0).');
    }
}
