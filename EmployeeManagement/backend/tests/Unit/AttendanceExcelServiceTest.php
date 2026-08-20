<?php

namespace Tests\Unit;

use App\Models\Attendance;
use App\Models\AttendancePeriod;
use App\Models\Employee;
use App\Models\WorkSession;
use App\Services\AttendanceExcelService;
use Illuminate\Support\Facades\File;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class AttendanceExcelServiceTest extends TestCase
{
    private string $originalStoragePath;

    private string $temporaryStoragePath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalStoragePath = app()->storagePath();
        $this->temporaryStoragePath = sys_get_temp_dir()
            .DIRECTORY_SEPARATOR
            .'attendance-excel-'.bin2hex(random_bytes(6));

        File::makeDirectory($this->temporaryStoragePath, 0755, true);
        app()->useStoragePath($this->temporaryStoragePath);
    }

    protected function tearDown(): void
    {
        app()->useStoragePath($this->originalStoragePath);
        File::deleteDirectory($this->temporaryStoragePath);

        parent::tearDown();
    }

    public function test_outside_destination_is_written_to_the_excel_report(): void
    {
        $employee = new Employee([
            'employee_code' => 'TM001',
        ]);
        $employee->id = 1;

        $attendance = new Attendance([
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-13',
            'clock_in' => '2026-08-13 09:00:00',
            'outside_destination' => '大阪法務局で書類提出',
            'outside_start' => '2026-08-13 10:00:00',
            'outside_expected_end' => '2026-08-13 12:00:00',
            'status' => 'outside',
        ]);
        $attendance->id = 42;
        $attendance->setRelation('employee', $employee);
        $period = new AttendancePeriod([
            'type' => 'outside',
            'destination' => '大阪法務局で書類提出',
            'started_at' => '2026-08-13 10:00:00',
            'expected_end_at' => '2026-08-13 12:00:00',
        ]);
        $period->id = 7;
        $period->attendance_id = 42;
        $attendance->setRelation('periods', collect([$period]));

        app(AttendanceExcelService::class)->sync($attendance);

        $filePath = $this->temporaryStoragePath
            .DIRECTORY_SEPARATOR.'app'
            .DIRECTORY_SEPARATOR.'attendance'
            .DIRECTORY_SEPARATOR.'attendance.xlsx';
        $spreadsheet = IOFactory::load($filePath);
        $sheet = $spreadsheet->getSheetByName('勤怠記録');

        $this->assertNotNull($sheet);
        $this->assertSame('外出先・用件', $sheet->getCell('H5')->getValue());
        $this->assertSame('大阪法務局で書類提出', $sheet->getCell('H6')->getValue());
        $this->assertSame('外出中', $sheet->getCell('M6')->getValue());
        $this->assertSame(
            '=IF(L6="","",MAX(0,L6-E6-SUMIFS(\'休憩・外出履歴\'!$K$6:$K$5000,\'休憩・外出履歴\'!$B$6:$B$5000,A6,\'休憩・外出履歴\'!$F$6:$F$5000,"休憩")))',
            $sheet->getCell('N6')->getValue()
        );
        $periodSheet = $spreadsheet->getSheetByName('休憩・外出履歴');
        $this->assertNotNull($periodSheet);
        $this->assertSame('大阪法務局で書類提出', $periodSheet->getCell('G6')->getValue());

        $spreadsheet->disconnectWorksheets();
    }

    public function test_work_session_is_written_to_a_separate_compact_sheet(): void
    {
        $employee = new Employee([
            'employee_code' => 'TM001',
        ]);
        $employee->id = 1;

        $attendance = new Attendance([
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-13',
        ]);
        $attendance->id = 42;
        $attendance->setRelation('employee', $employee);

        $workSession = new WorkSession([
            'task_description' => '契約書の確認',
            'started_at' => '2026-08-13 09:00:00',
            'expected_end_at' => '2026-08-13 10:00:00',
            'ended_at' => '2026-08-13 09:50:00',
            'status' => 'completed',
        ]);
        $workSession->id = 8;
        $workSession->setRelation('attendance', $attendance);

        app(AttendanceExcelService::class)->syncWorkSession($workSession);

        $filePath = $this->temporaryStoragePath
            .DIRECTORY_SEPARATOR.'app'
            .DIRECTORY_SEPARATOR.'attendance'
            .DIRECTORY_SEPARATOR.'attendance.xlsx';
        $spreadsheet = IOFactory::load($filePath);
        $sheet = $spreadsheet->getSheetByName('作業記録');

        $this->assertNotNull($sheet);
        $this->assertSame('作業内容', $sheet->getCell('E5')->getValue());
        $this->assertSame('契約書の確認', $sheet->getCell('E6')->getValue());
        $this->assertSame('完了', $sheet->getCell('I6')->getValue());
        $this->assertSame(
            '=IF(F6="","",MAX(0,IF(H6="",NOW(),H6)-F6))',
            $sheet->getCell('J6')->getValue()
        );
        $this->assertFalse($sheet->getColumnDimension('A')->getVisible());

        $spreadsheet->disconnectWorksheets();
    }
}
