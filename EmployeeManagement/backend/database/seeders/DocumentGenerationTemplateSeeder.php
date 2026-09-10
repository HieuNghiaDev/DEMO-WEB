<?php

namespace Database\Seeders;

use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentType;
use Illuminate\Database\Seeder;
use RuntimeException;

class DocumentGenerationTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $documentType = DocumentType::query()->where('code', 'C-001')->first();
        if (! $documentType) {
            throw new RuntimeException('C-001 document master is required before seeding its generation template.');
        }

        $documentType->update(['handling_type' => 'office_generated']);

        DocumentGenerationTemplate::query()->firstOrCreate(
            ['document_type_id' => $documentType->id, 'version' => 1],
            [
                'renderer_type' => 'generic_legal_document',
                'format' => 'html',
                'template_body' => '<article><h1>{{document_name}}</h1><section data-template-fields></section></article>',
                'field_schema' => [
                    ['key' => 'client_name', 'label' => '依頼者氏名', 'type' => 'text', 'required' => true, 'source' => 'client.name'],
                    ['key' => 'client_address', 'label' => '住所', 'type' => 'text', 'required' => false, 'source' => 'client.address'],
                    ['key' => 'contract_date', 'label' => '契約日', 'type' => 'date', 'required' => true],
                    ['key' => 'case_title', 'label' => '事件名', 'type' => 'text', 'required' => false, 'source' => 'case_file.title'],
                    ['key' => 'responsible_person', 'label' => '担当者', 'type' => 'text', 'required' => false, 'source' => 'case_document.assigned_employee.full_name'],
                    ['key' => 'notes', 'label' => '備考', 'type' => 'textarea', 'required' => false, 'wide' => true, 'rows' => 5],
                ],
                'is_active' => true,
            ]
        );

        DocumentGenerationTemplate::query()->firstOrCreate(
            ['document_type_id' => $documentType->id, 'version' => 2],
            [
                'renderer_type' => 'generic_legal_document',
                'format' => 'html',
                'template_body' => <<<'HTML'
<article>
<p><strong>参考テンプレート</strong><br>※ 本書式は事務所承認前の参考版です。</p>
<h1>{{document_name}}</h1>
<h2>契約日</h2>
<table><tbody><tr><th>契約日</th><td>{{contract_date}}</td></tr></tbody></table>
<h2>1. 依頼者</h2>
<table><tbody><tr><th>氏名</th><td>{{client_name}}</td></tr><tr><th>住所</th><td>{{client_address}}</td></tr></tbody></table>
<h2>2. 受任者</h2>
<table><tbody><tr><th>弁護士・担当者</th><td>{{responsible_person}}</td></tr></tbody></table>
<h2>3. 事件の表示</h2>
<table><tbody><tr><th>事件名</th><td>{{case_title}}</td></tr><tr><th>案件番号</th><td>{{case_reference}}</td></tr></tbody></table>
<h2>4. 委任する法律事務の範囲</h2>
<p>{{engagement_scope}}</p>
<h2>5. 弁護士報酬</h2>
<table><tbody><tr><th>報酬の種類</th><td>{{fee_type}}</td></tr><tr><th>金額</th><td>{{fee_amount}}</td></tr><tr><th>算定方法</th><td>{{fee_calculation_method}}</td></tr><tr><th>支払時期</th><td>{{fee_payment_timing}}</td></tr></tbody></table>
<h2>6. 実費・その他費用</h2>
<p>{{expense_notes}}</p>
<h2>7. 契約の解除</h2>
<p>{{termination_notes}}</p>
<h2>8. 中途終了時の清算</h2>
<p>{{early_termination_settlement}}</p>
<h2>9. 備考</h2>
<p>{{notes}}</p>
<h2>10. 署名・確認欄</h2>
<table><tbody><tr><th>依頼者</th><td>{{client_signature_name}}</td></tr><tr><th>弁護士・担当者</th><td>{{lawyer_signature_name}}</td></tr></tbody></table>
</article>
HTML,
                'field_schema' => [
                    ['key' => 'contract_date', 'label' => '契約日', 'type' => 'date', 'required' => true],
                    ['key' => 'client_name', 'label' => '依頼者氏名', 'type' => 'text', 'required' => true, 'source' => 'client.name'],
                    ['key' => 'client_address', 'label' => '依頼者住所', 'type' => 'text', 'required' => false, 'source' => 'client.address'],
                    ['key' => 'responsible_person', 'label' => '弁護士・担当者', 'type' => 'text', 'required' => true, 'source' => 'case_document.assigned_employee.full_name'],
                    ['key' => 'case_title', 'label' => '事件名', 'type' => 'text', 'required' => true, 'source' => 'case_file.title'],
                    ['key' => 'case_reference', 'label' => '案件番号', 'type' => 'text', 'required' => false, 'source' => 'case_file.reference_number'],
                    ['key' => 'engagement_scope', 'label' => '委任する法律事務の範囲', 'type' => 'textarea', 'required' => true, 'wide' => true, 'rows' => 5],
                    ['key' => 'fee_type', 'label' => '報酬の種類', 'type' => 'text', 'required' => true],
                    ['key' => 'fee_amount', 'label' => '報酬金額', 'type' => 'text', 'required' => true],
                    ['key' => 'fee_calculation_method', 'label' => '報酬の算定方法', 'type' => 'textarea', 'required' => true, 'wide' => true, 'rows' => 3],
                    ['key' => 'fee_payment_timing', 'label' => '報酬の支払時期', 'type' => 'text', 'required' => true],
                    ['key' => 'expense_notes', 'label' => '実費・その他費用', 'type' => 'textarea', 'required' => false, 'wide' => true, 'rows' => 3],
                    ['key' => 'termination_notes', 'label' => '契約の解除', 'type' => 'textarea', 'required' => true, 'wide' => true, 'rows' => 4],
                    ['key' => 'early_termination_settlement', 'label' => '中途終了時の清算', 'type' => 'textarea', 'required' => true, 'wide' => true, 'rows' => 4],
                    ['key' => 'notes', 'label' => '備考', 'type' => 'textarea', 'required' => false, 'wide' => true, 'rows' => 4],
                    ['key' => 'client_signature_name', 'label' => '依頼者署名氏名', 'type' => 'text', 'required' => true, 'source' => 'client.name'],
                    ['key' => 'lawyer_signature_name', 'label' => '弁護士・担当者署名氏名', 'type' => 'text', 'required' => true, 'source' => 'case_document.assigned_employee.full_name'],
                ],
                'is_active' => true,
            ]
        );
    }
}
