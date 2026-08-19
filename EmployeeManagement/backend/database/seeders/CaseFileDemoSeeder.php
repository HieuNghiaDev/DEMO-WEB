<?php

namespace Database\Seeders;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseMeetingLog;
use App\Models\CasePrecedent;
use App\Models\Client;
use App\Models\Employee;
use Illuminate\Database\Seeder;
use RuntimeException;

class CaseFileDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'development', 'testing'])) {
            throw new RuntimeException('CaseFileDemoSeeder may only run in local, development, or testing environments.');
        }

        // Upgrade previously seeded local records in place so re-running this
        // seeder does not leave older names alongside the normal names below.
        foreach ([
            'demo-case-alpha@example.test' => 'nguyen.minh.anh@example.test',
            'demo-case-beta@example.test' => 'tran.thanh.binh@example.test',
            'demo-case-gamma@example.test' => 'sakura@example.test',
            'demo-sakura@example.test' => 'sakura.trading@example.test',
            'demo-riverstone@example.test' => 'riverstone.labs@example.test',
            'demo-maple@example.test' => 'maple.studio@example.test',
        ] as $oldEmail => $email) {
            Client::query()->where('email', $oldEmail)->update(['email' => $email]);
        }

        foreach ([
            'sakura.trading@example.test' => ['name' => 'Sakura Trading Co.', 'name_vn' => 'Công ty Sakura Trading', 'phone' => '090-1000-001'],
            'riverstone.labs@example.test' => ['name' => 'Riverstone Labs', 'name_vn' => 'Riverstone Labs', 'phone' => '090-1000-002'],
            'maple.studio@example.test' => ['name' => 'Maple Studio', 'name_vn' => 'Maple Studio', 'phone' => '090-1000-003'],
        ] as $email => $attributes) {
            Client::query()->where('email', $email)->update($attributes);
        }

        foreach ([
            'DEMO CASE FILE: Nguyen Minh Anh 在留期間更新' => 'Nguyen Minh Anh - 在留期間更新',
            'DEMO CASE FILE: Tran Thanh Binh 労災相談' => 'Tran Thanh Binh - 労災相談',
            'DEMO CASE FILE: Sakura 契約レビュー' => 'Sakura - 契約レビュー',
            'DEMO CASE FILE: 初回相談完了サンプル' => '初回相談',
            'DEMO CASE FILE: 在留期間更新（Nguyen Minh Anh）' => 'Nguyen Minh Anh - 在留期間更新',
            'DEMO CASE FILE: 労災相談（Tran Thanh Binh）' => 'Tran Thanh Binh - 労災相談',
            'DEMO CASE FILE: 業務委託契約レビュー（Sakura）' => 'Sakura - 業務委託契約レビュー',
        ] as $oldTitle => $title) {
            CaseFile::query()->where('title', $oldTitle)->update(['title' => $title]);
        }

        CaseFile::query()->where('title', 'Nguyen Minh Anh - 在留期間更新')->whereNull('case_type')->update(['case_type' => '在留期間更新']);
        CaseFile::query()->where('title', 'Tran Thanh Binh - 労災相談')->whereNull('case_type')->update(['case_type' => '労災事故']);
        CaseFile::query()->where('title', 'Sakura - 業務委託契約レビュー')->whereNull('case_type')->update(['case_type' => '業務委託契約']);

        foreach ([
            'DEMO: 申請書（第1稿）' => '申請書（第1稿）',
            'DEMO: パスポート写し' => 'パスポート写し',
            'DEMO: 委任状' => '委任状',
        ] as $oldTitle => $title) {
            CaseDocument::query()->where('title', $oldTitle)->update(['title' => $title]);
        }
        CaseDocument::query()->where('file_url', 'https://example.test/demo-case-document')->update(['file_url' => 'https://example.test/case-document']);
        CasePrecedent::query()->where('title', 'DEMO: 入管法関連メモ')->update([
            'title' => '入管法関連メモ',
            'citation' => '出入国管理及び難民認定法',
            'summary' => '在留期間更新に関する確認事項です。',
            'source_url' => 'https://example.test/precedent',
        ]);
        CaseMeetingLog::query()->where('attendees', 'DEMO client, DEMO staff')->update([
            'attendees' => 'Nguyen Minh Anh, 担当者',
            'content' => '在留期間更新に必要な資料を確認しました。',
        ]);

        $employeeId = Employee::query()->value('id');
        $clients = [
            'alpha' => Client::updateOrCreate(['email' => 'nguyen.minh.anh@example.test'], ['name' => 'Nguyen Minh Anh', 'name_kana' => 'グエン・ミン・アイン', 'client_type' => 'individual', 'nationality' => 'VN', 'phone' => '090-0000-001', 'notes' => null]),
            'beta' => Client::updateOrCreate(['email' => 'tran.thanh.binh@example.test'], ['name' => 'Tran Thanh Binh', 'name_kana' => 'チャン・タイン・ビン', 'client_type' => 'individual', 'nationality' => 'VN', 'phone' => '090-0000-002', 'notes' => null]),
            'gamma' => Client::updateOrCreate(['email' => 'sakura@example.test'], ['name' => 'Sakura Example KK', 'name_kana' => 'サクラ・エグザンプル', 'client_type' => 'corporate', 'nationality' => 'JP', 'phone' => '090-0000-003', 'notes' => null]),
        ];

        $caseFiles = [];
        foreach ([
            ['key' => 'visa', 'title' => 'Nguyen Minh Anh - 在留期間更新', 'case_type' => '在留期間更新', 'client' => 'alpha', 'status' => 'active'],
            ['key' => 'labor', 'title' => 'Tran Thanh Binh - 労災相談', 'case_type' => '労災事故', 'client' => 'beta', 'status' => 'waiting_documents'],
            ['key' => 'contract', 'title' => 'Sakura - 契約レビュー', 'case_type' => '業務委託契約', 'client' => 'gamma', 'status' => 'reviewing'],
            ['key' => 'closed', 'title' => '初回相談', 'case_type' => '初回相談', 'client' => 'alpha', 'status' => 'waiting_payment'],
        ] as $data) {
            $caseFiles[$data['key']] = CaseFile::updateOrCreate(['title' => $data['title']], ['case_type' => $data['case_type'], 'client_id' => $clients[$data['client']]->id, 'assigned_employee_id' => $employeeId, 'status' => $data['status']]);
        }

        $case = $caseFiles['visa'];
        foreach ([
            ['title' => '申請書（第1稿）', 'category' => '主張書面', 'status' => 'draft', 'created_by_ai_name' => 'AI 秘書'],
            ['title' => 'パスポート写し', 'category' => '証拠', 'status' => 'confirmed', 'created_by_employee_id' => $employeeId],
            ['title' => '委任状', 'category' => '委任状', 'status' => 'submitted', 'created_by_employee_id' => $employeeId],
        ] as $document) {
            CaseDocument::updateOrCreate(['case_file_id' => $case->id, 'title' => $document['title']], [...$document, 'file_url' => 'https://example.test/case-document', 'version' => '1']);
        }
        CasePrecedent::query()->where('case_file_id', $case->id)->where('title', 'DEMO: 入管法関連メモ')->update(['title' => '入管法関連メモ']);
        CasePrecedent::updateOrCreate(['case_file_id' => $case->id, 'title' => '入管法関連メモ'], ['citation' => '出入国管理及び難民認定法', 'summary' => '在留期間更新に関する確認事項です。', 'relevance' => '在留期間更新の確認用。', 'source_url' => 'https://example.test/precedent', 'created_by_ai_name' => 'AI 秘書']);
        CaseMeetingLog::updateOrCreate(['case_file_id' => $case->id, 'meeting_date' => today()->toDateString()], ['attendees' => 'Nguyen Minh Anh, 担当者', 'content' => '在留期間更新に必要な資料を確認しました。', 'next_action' => '追加資料を確認する。', 'status' => 'draft', 'created_by_ai_name' => 'AI 秘書']);
    }
}
