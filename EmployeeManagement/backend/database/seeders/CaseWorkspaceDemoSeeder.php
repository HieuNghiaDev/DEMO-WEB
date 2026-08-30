<?php

namespace Database\Seeders;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Client;
use App\Models\Employee;
use App\Services\CaseDocumentChecklistService;
use Illuminate\Database\Seeder;
use RuntimeException;

class CaseWorkspaceDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'development', 'testing'])) {
            throw new RuntimeException('CaseWorkspaceDemoSeeder may only run in local, development, or testing environments.');
        }

        $client = Client::query()->updateOrCreate(
            ['email' => 'themis.case.demo@example.test'],
            [
                'name' => 'NGUYEN THI LAN',
                'name_kana' => 'グエン・ティ・ラン',
                'client_type' => 'individual',
                'phone' => '090-1234-5678',
                'address' => '東京都新宿区西新宿1-1-1',
                'nationality' => 'VN',
                'notes' => '日本語での連絡可。平日18時以降を希望。',
            ],
        );
        $caseType = CaseType::query()->where('name', '在留期間更新')->firstOrFail();
        $employeeId = Employee::query()->value('id');
        $caseFile = CaseFile::query()->updateOrCreate(
            ['title' => 'NGUYEN THI LAN - 在留期間更新'],
            [
                'reference_number' => 'CASE-2026-028',
                'client_id' => $client->id,
                'case_type_id' => $caseType->id,
                'case_type' => $caseType->name,
                'assigned_employee_id' => $employeeId,
                'status' => 'waiting_documents',
                'priority' => 'high',
                'summary' => '在留期間更新。所属機関資料と最新の課税証明を収集中。',
                'opened_at' => '2026-08-20',
                'target_completion_at' => '2026-09-20',
            ],
        );

        app(CaseDocumentChecklistService::class)->applyDefaultTemplate($caseFile);
        $caseFile->documents()->where('title', '申請書')->update(['status' => 'confirmed', 'received_at' => '2026-08-22']);
        $caseFile->documents()->where('title', '写真')->update(['status' => 'received', 'received_at' => '2026-08-24']);
        $caseFile->documents()->where('title', 'パスポート・在留カード')->update(['status' => 'reviewing', 'received_at' => '2026-08-25', 'expires_at' => '2027-04-12']);
        $caseFile->documents()->where('title', '所属機関カテゴリー証明')->update(['status' => 'requested', 'due_at' => '2026-09-03']);
        $caseFile->documents()->updateOrCreate(
            ['title' => '雇用理由補足説明書'],
            ['category' => '案件追加資料', 'requirement_level' => 'optional', 'status' => 'draft', 'version' => '1', 'is_template_generated' => false],
        );

        $caseFile->parties()->updateOrCreate(
            ['party_type' => 'employer', 'name' => 'THEMIS Support株式会社'],
            ['organization' => '人事部', 'relationship' => '所属機関', 'phone' => '03-1234-5678', 'email' => 'hr@example.test'],
        );
        $caseFile->deadlines()->updateOrCreate(
            ['title' => '在留期限'],
            ['deadline_type' => 'residence', 'due_at' => '2026-09-28 23:59:00', 'status' => 'open', 'priority' => 'critical'],
        );
        $caseFile->deadlines()->updateOrCreate(
            ['title' => '社内提出準備期限'],
            ['deadline_type' => 'internal', 'due_at' => '2026-09-10 17:00:00', 'status' => 'open', 'priority' => 'high'],
        );
        $caseFile->caseTasks()->updateOrCreate(
            ['title' => '所属機関資料の受領確認'],
            ['assigned_employee_id' => $employeeId, 'description' => '会社担当者へ再連絡し、受領予定日を確認する。', 'status' => 'in_progress', 'priority' => 'high', 'due_at' => '2026-09-02 17:00:00'],
        );
        $caseFile->caseTasks()->updateOrCreate(
            ['title' => '申請書最終レビュー'],
            ['assigned_employee_id' => $employeeId, 'status' => 'pending', 'priority' => 'normal', 'due_at' => '2026-09-08 17:00:00'],
        );
        $caseFile->activities()->updateOrCreate(
            ['title' => '必要書類一覧を顧客へ送付', 'occurred_at' => '2026-08-21 10:30:00'],
            ['activity_type' => 'communication', 'channel' => 'email', 'content' => '更新申請の必要書類一覧と提出方法を案内。', 'created_by_employee_id' => $employeeId],
        );
        $caseFile->activities()->updateOrCreate(
            ['title' => 'パスポート・在留カードを受領', 'occurred_at' => '2026-08-25 14:00:00'],
            ['activity_type' => 'event', 'channel' => 'internal', 'content' => 'Google Driveリンクを登録し、内容確認を開始。', 'created_by_employee_id' => $employeeId],
        );
    }
}
