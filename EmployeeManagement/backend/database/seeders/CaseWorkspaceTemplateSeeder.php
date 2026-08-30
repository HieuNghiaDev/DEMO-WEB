<?php

namespace Database\Seeders;

use App\Models\CaseType;
use App\Models\DocumentTemplate;
use Illuminate\Database\Seeder;

class CaseWorkspaceTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $groups = [
            '在留・入管' => [
                '在留期間更新' => [
                    ['申請書', 'required', '全カテゴリーの基本書類'],
                    ['写真', 'required', '規格と撮影日を確認'],
                    ['パスポート・在留カード', 'required', '原本提示と有効期限を管理'],
                    ['所属機関カテゴリー証明', 'conditional', '所属機関カテゴリー1〜4に応じて確認'],
                    ['雇用契約書・労働条件通知書', 'conditional', '変更または説明が必要な場合'],
                    ['職務内容説明・会社資料・税務資料', 'conditional', '所属機関カテゴリー等に応じる'],
                ],
                '技能実習→特定技能1号' => [
                    ['在留資格変更許可申請書', 'required', '変更申請の基本書類'],
                    ['写真・パスポート・在留カード', 'required', '本人確認と有効期限を確認'],
                    ['特定技能雇用契約書・雇用条件書', 'required', '受入れ条件を確認'],
                    ['技能水準・日本語能力資料', 'conditional', '技能実習2号の修了状況に応じる'],
                    ['健康診断関係', 'required', '所定様式と作成日を管理'],
                    ['所属機関資料', 'conditional', '法人区分と受入実績に応じる'],
                    ['1号特定技能外国人支援計画関係', 'required', '自社支援・委託を区別'],
                    ['分野別提出書類', 'conditional', '対象分野に応じる'],
                ],
                '留学→技術・人文知識・国際業務' => [
                    ['申請書・写真・パスポート・在留カード', 'required', '本人の基本書類'],
                    ['卒業証明・卒業見込・成績証明', 'conditional', '学歴・専攻と職務の関係を確認'],
                    ['雇用契約書・労働条件通知書', 'required', '開始日・報酬・職務内容を確認'],
                    ['職務内容説明・会社概要・税務資料', 'conditional', '所属機関カテゴリーに応じる'],
                ],
                '家族滞在' => [
                    ['申請書・写真・パスポート・在留カード', 'required', '申請区分に応じる'],
                    ['婚姻・出生等の親族関係資料', 'required', '親族関係を証明'],
                    ['扶養者の在留・身分資料', 'required', '在留カード等'],
                    ['扶養者の在職・収入・課税納税資料', 'conditional', '扶養能力を確認'],
                    ['預金残高・奨学金等', 'conditional', '状況に応じる'],
                ],
                '日本人の配偶者等' => [
                    ['申請書・写真・パスポート・在留カード', 'required', '本人の基本書類'],
                    ['日本人配偶者の戸籍謄本', 'required', '婚姻関係等を確認'],
                    ['婚姻証明・住民票', 'conditional', '申請状況に応じる'],
                    ['質問書・身元保証書', 'required', '指定様式を使用'],
                    ['交際経緯・写真・連絡履歴', 'conditional', '関係の実体説明が必要な場合'],
                ],
                '永住許可' => [
                    ['永住許可申請書・写真・パスポート・在留カード', 'required', '本人の基本書類'],
                    ['理由書・住民票', 'required', '生活基盤と世帯を確認'],
                    ['在職証明・事業資料', 'conditional', '就労形態に応じる'],
                    ['課税・納税関係', 'required', '対象期間を案件属性で管理'],
                    ['年金・健康保険関係', 'required', '公的義務履行状況を確認'],
                    ['預金・資産関係', 'conditional', '補強資料'],
                    ['身元保証関係・了解書等', 'required', '最新様式を確認'],
                ],
            ],
            '労災' => [
                '療養（業務災害・通勤災害）' => [
                    ['災害発生日・場所・作業内容・発生状況', 'required', '案件基本情報として構造化'],
                    ['事故立証資料', 'conditional', '写真・CCTV・目撃者・社内報告'],
                    ['診断書・診療記録・領収書等', 'required', '医療資料を時系列で管理'],
                    ['様式第5号・第7号', 'conditional', '業務災害の場合'],
                    ['第16号の3・第16号の5', 'conditional', '通勤災害の場合'],
                ],
                '休業（補償）給付' => [
                    ['休業期間・医師証明', 'required', '休業開始日・終了日を管理'],
                    ['賃金台帳・給与明細・出勤簿等', 'required', '賃金と休業実態を確認'],
                    ['様式第8号', 'conditional', '業務災害の場合'],
                    ['第16号の6', 'conditional', '通勤災害の場合'],
                ],
                '障害（補償）給付' => [
                    ['症状固定日', 'required', '医師判断を記録'],
                    ['障害診断書', 'required', '等級判断の基礎資料'],
                    ['MRI・CT・X線・手術・リハビリ記録', 'conditional', '傷病に応じて追加'],
                    ['様式第10号・第16号の7', 'conditional', '業務災害・通勤災害を区別'],
                ],
            ],
            '労働問題' => [
                '不当解雇・雇止め' => [
                    ['雇用契約書・労働条件通知書', 'required', '雇用条件の基礎'],
                    ['解雇通知・解雇理由証明書', 'required', '解雇日・理由・通知方法を管理'],
                    ['就業規則・懲戒規程・人事評価', 'conditional', '会社主張の根拠を確認'],
                    ['メール・LINE・Slack・録音', 'conditional', '経緯・発言の立証'],
                    ['給与明細・勤務記録', 'conditional', '損害と雇用実態を確認'],
                ],
                '未払賃金・未払残業代' => [
                    ['雇用契約書・賃金規程', 'required', '賃金条件を特定'],
                    ['給与明細・振込履歴', 'required', '実際の支給額を確認'],
                    ['タイムカード・出勤簿・シフト', 'required', '労働時間を算定'],
                    ['PCログ・メール・業務日報', 'conditional', '勤務実態を補強'],
                    ['残業時間・未払額計算表', 'required', '請求額を計算'],
                ],
                'ハラスメント' => [
                    ['相談者陳述書・時系列', 'required', '日時・場所・人物・行為を構造化'],
                    ['メール・チャット・録音・動画', 'conditional', '証拠を保全'],
                    ['目撃者一覧', 'conditional', '接触可能性も管理'],
                    ['社内相談・HR対応記録', 'conditional', '会社の対応経緯'],
                    ['診断書等', 'conditional', '健康影響がある場合'],
                ],
            ],
            '交通事故' => [
                '傷害事故' => [
                    ['交通事故証明書', 'required', '人身事故扱い等を確認'],
                    ['事故発生状況報告書', 'required', '事故態様を記録'],
                    ['現場写真・ドラレコ・警察資料', 'conditional', '過失と事故状況を補強'],
                    ['診断書・診療報酬明細書', 'required', '治療機関ごとに管理'],
                    ['通院交通費明細・領収書', 'conditional', '損害項目別に集計'],
                    ['休業損害証明・源泉徴収票', 'conditional', '給与所得者等'],
                    ['確定申告・課税納税証明', 'conditional', '自営業者等'],
                ],
                '後遺障害' => [
                    ['後遺障害診断書', 'required', '症状固定後に管理'],
                    ['症状固定日', 'required', '請求期限と工程に影響'],
                    ['MRI・CT・X線等', 'conditional', '傷病に応じる'],
                    ['治療・リハビリ履歴', 'conditional', '経過を立証'],
                ],
                '死亡事故' => [
                    ['死亡診断書・死体検案書', 'required', '死亡事実を証明'],
                    ['戸籍謄本等', 'required', '請求権者と相続関係を確認'],
                    ['委任状・印鑑証明', 'conditional', '請求権者が複数の場合等'],
                    ['収入証明', 'conditional', '逸失利益等を算定'],
                ],
            ],
            '損害賠償' => [
                '損害賠償一般' => [
                    ['事実関係資料', 'required', '契約・事故・写真・連絡履歴'],
                    ['責任関係資料', 'required', '相手方責任の根拠'],
                    ['損害資料', 'required', '診断書・領収書・請求書・見積'],
                    ['因果関係資料', 'conditional', '医療記録・専門家資料'],
                    ['請求額計算表', 'required', '損害項目と請求額を整理'],
                ],
            ],
        ];

        $groupOrder = 1;
        foreach ($groups as $groupName => $subtypes) {
            $group = CaseType::query()->updateOrCreate(
                ['name' => $groupName],
                ['parent_id' => null, 'sort_order' => $groupOrder++ * 100, 'is_active' => true],
            );

            $subtypeOrder = 1;
            foreach ($subtypes as $subtypeName => $items) {
                $subtype = CaseType::query()->updateOrCreate(
                    ['name' => $subtypeName],
                    ['parent_id' => $group->id, 'sort_order' => $subtypeOrder++, 'is_active' => true],
                );
                $template = DocumentTemplate::query()->updateOrCreate(
                    ['case_type_id' => $subtype->id, 'version' => 1],
                    ['name' => $subtypeName.' 必要書類', 'is_active' => true, 'effective_from' => '2026-08-28', 'source_reference' => 'THEMIS 案件・書類管理システム 要件資料 2026-08-28'],
                );

                foreach ($items as $index => [$title, $level, $description]) {
                    $template->items()->updateOrCreate(
                        ['code' => 'DOC-'.str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT)],
                        ['title' => $title, 'requirement_level' => $level, 'description' => $description, 'sort_order' => $index + 1],
                    );
                }
            }
        }
    }
}
