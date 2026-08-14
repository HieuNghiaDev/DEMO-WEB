<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class PersonalAttendanceReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_download_a_personal_attendance_report(): void
    {
        $this->getJson('/api/attendances/my-report')->assertUnauthorized();
    }

    public function test_report_contains_only_the_signed_in_employees_records(): void
    {
        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);
        $employee = $this->createEmployee(
            $office,
            'TM001',
            'LE HIEU NGHIA',
            'nghialezsm@gmail.com'
        );
        $otherEmployee = $this->createEmployee(
            $office,
            'TM002',
            'TRINH THI THU HUONG',
            'trinhhuong888888@gmail.com'
        );

        $attendance = $this->createAttendance($employee, '2026-08-13');
        $attendance->workSessions()->create([
            'task_description' => '=HYPERLINK("https://example.com","確認")',
            'started_at' => '2026-08-13 09:15:00',
            'expected_end_at' => '2026-08-13 10:15:00',
            'ended_at' => '2026-08-13 10:00:00',
            'status' => 'completed',
        ]);
        $this->createAttendance($otherEmployee, '2026-08-12');

        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $employee->id,
        ]));

        $response = $this->get('/api/attendances/my-report')
            ->assertOk()
            ->assertHeader(
                'content-type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );

        $this->assertStringContainsString(
            'attachment; filename=attendance-TM001-',
            (string) $response->headers->get('content-disposition')
        );

        $temporaryFile = tempnam(sys_get_temp_dir(), 'attendance-report-');
        $this->assertNotFalse($temporaryFile);
        file_put_contents($temporaryFile, $response->streamedContent());

        try {
            $workbook = IOFactory::load($temporaryFile);
            $this->assertSame(['勤怠記録', '作業記録'], $workbook->getSheetNames());

            $attendanceValues = json_encode(
                $workbook->getSheetByName('勤怠記録')?->toArray(),
                JSON_UNESCAPED_UNICODE
            );
            $workSessionSheet = $workbook->getSheetByName('作業記録');
            $workSessionValues = json_encode(
                $workSessionSheet?->toArray(),
                JSON_UNESCAPED_UNICODE
            );

            $this->assertStringContainsString('LE HIEU NGHIA', $attendanceValues);
            $this->assertStringNotContainsString('TRINH THI THU HUONG', $attendanceValues);
            $this->assertStringContainsString('HYPERLINK', $workSessionValues);
            $this->assertSame(
                DataType::TYPE_STRING,
                $workSessionSheet?->getCell('B8')->getDataType()
            );
            $this->assertSame(120, $workSessionSheet?->getSheetView()->getZoomScale());
            $this->assertFalse($workSessionSheet?->getShowGridlines());

            $workbook->disconnectWorksheets();
        } finally {
            @unlink($temporaryFile);
        }
    }

    private function createEmployee(
        Office $office,
        string $employeeCode,
        string $fullName,
        string $email
    ): Employee {
        return Employee::create([
            'employee_code' => $employeeCode,
            'full_name' => $fullName,
            'gender' => 'male',
            'hire_date' => '2026-08-13',
            'office_id' => $office->id,
            'work_email' => $email,
            'status' => 'active',
        ]);
    }

    private function createAttendance(
        Employee $employee,
        string $workDate
    ): Attendance {
        return Attendance::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->full_name,
            'work_date' => $workDate,
            'clock_in' => $workDate.' 09:00:00',
            'clock_out' => $workDate.' 18:00:00',
            'status' => 'offline',
        ]);
    }
}
