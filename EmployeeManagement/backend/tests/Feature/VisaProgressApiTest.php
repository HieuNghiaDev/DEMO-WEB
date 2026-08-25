<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\GoogleDriveService;
use Carbon\Carbon;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Mockery;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

class VisaProgressApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Carbon::setTestNow(Carbon::parse('2026-08-25 09:00:00', 'Asia/Tokyo'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_visa_progress_requires_authentication(): void
    {
        $this->getJson('/api/visa-progress')->assertUnauthorized();
    }

    public function test_visa_progress_requires_case_view_permission(): void
    {
        $this->actingAs(User::factory()->create(), 'sanctum')
            ->getJson('/api/visa-progress')
            ->assertForbidden();
    }

    public function test_visa_progress_returns_a_controlled_configuration_error_when_drive_is_not_set_up(): void
    {
        config([
            'services.google_drive.enabled' => false,
            'services.google_drive.file_id' => null,
            'services.google_drive.service_account_json' => null,
        ]);

        $this->actingAs($this->userWithCaseViewPermission(), 'sanctum')
            ->getJson('/api/visa-progress')
            ->assertStatus(503)
            ->assertJsonPath('code', 'google_drive_not_configured')
            ->assertJsonPath('message', 'Google Driveとの接続設定が完了していません。管理者に確認してください。');
    }

    public function test_visa_progress_downloads_and_normalizes_the_configured_workbook(): void
    {
        $this->fakeGoogleDriveDownload($this->workbookContents());

        $response = $this->actingAs($this->userWithCaseViewPermission(), 'sanctum')
            ->getJson('/api/visa-progress')
            ->assertOk()
            ->assertJsonPath('data.source.name', '在留申請進捗管理_テスト.xlsx')
            ->assertJsonPath('data.source.sheet_name', '追加資料管理')
            ->assertJsonPath('data.summary.total', 3)
            ->assertJsonPath('data.summary.in_review', 1)
            ->assertJsonPath('data.summary.approved', 1)
            ->assertJsonPath('data.summary.attention_required', 1)
            ->assertJsonPath('data.applications.0.case_id', 'VISA-001')
            ->assertJsonPath('data.applications.0.application_date', '2026-08-10')
            ->assertJsonPath('data.applications.0.deadline', '2026-08-28')
            ->assertJsonPath('data.applications.0.days_remaining', 3)
            ->assertJsonPath('data.applications.0.deadline_level', 'critical')
            ->assertJsonPath('data.applications.2.status', '独自ステータス');

        $this->assertCount(3, $response->json('data.applications'));
    }

    public function test_visa_progress_returns_a_controlled_workbook_error_when_the_download_is_not_an_excel_file(): void
    {
        $this->fakeGoogleDriveDownload('not an Excel workbook');

        $this->actingAs($this->userWithCaseViewPermission(), 'sanctum')
            ->getJson('/api/visa-progress')
            ->assertStatus(422)
            ->assertJsonPath('code', 'visa_progress_workbook_invalid');
    }

    private function userWithCaseViewPermission(): User
    {
        $user = User::factory()->create();
        $permission = Permission::query()->firstOrCreate([
            'name' => 'case.view',
        ], [
            'display_name' => '案件を閲覧',
        ]);
        $role = Role::query()->create([
            'name' => 'visa_progress_reviewer_'.uniqid(),
            'display_name' => 'Visa Progress Reviewer',
        ]);
        $role->permissions()->sync([$permission->id]);
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function fakeGoogleDriveDownload(string $contents): void
    {
        $directory = storage_path('app/testing');
        File::ensureDirectoryExists($directory);
        $path = $directory.'/visa-progress-download-'.uniqid().'.xlsx';
        File::put($path, $contents);

        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadConfiguredWorkbook')->once()->andReturn([
            'path' => $path,
            'temporary_path' => 'testing/'.basename($path),
            'metadata' => [
                'id' => 'test-visa-progress',
                'name' => '在留申請進捗管理_テスト.xlsx',
                'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'modified_at' => '2026-08-25T01:05:00Z',
            ],
        ]);
        $drive->shouldReceive('deleteDownload')->once()->andReturnUsing(function () use ($path): void {
            File::delete($path);
        });
        $this->app->instance(GoogleDriveService::class, $drive);
    }

    private function workbookContents(): string
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('追加資料管理');
        $sheet->fromArray([
            ['案件ID', '申請者氏名', '申請種別', '全体ステータス', '担当者', '申請日', '追加資料提出期限'],
            ['VISA-001', '山田 太郎', '在留期間更新', '審査中', '鈴木', ExcelDate::PHPToExcel(new DateTimeImmutable('2026-08-10')), ExcelDate::PHPToExcel(new DateTimeImmutable('2026-08-28'))],
            ['VISA-002', '佐藤 花子', '在留資格変更', '許可', '田中', '2026/08/11', null],
            ['VISA-003', 'NGUYEN VAN A', '就労資格証明', '独自ステータス', null, null, null],
        ]);
        $sheet->getStyle('F2:G2')->getNumberFormat()->setFormatCode('yyyy-mm-dd');

        $directory = storage_path('app/testing');
        File::ensureDirectoryExists($directory);
        $path = $directory.'/visa-progress-'.uniqid().'.xlsx';
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($path);
        $spreadsheet->disconnectWorksheets();
        $contents = (string) file_get_contents($path);
        File::delete($path);

        return $contents;
    }
}
