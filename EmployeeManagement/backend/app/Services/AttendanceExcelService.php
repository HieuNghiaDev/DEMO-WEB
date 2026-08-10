<?php

namespace App\Services;

use App\Models\Attendance;
use Carbon\Carbon;
use DateTimeInterface;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use RuntimeException;

class AttendanceExcelService
{
    /**
     * Ghi hoặc cập nhật một bản chấm công trong file Excel.
     */
    public function sync(Attendance $attendance): void
    {
        $filePath = storage_path(
            'app/attendance/attendance.xlsx'
        );

        if (! file_exists($filePath)) {
            throw new RuntimeException(
                'Không tìm thấy file Excel: '.$filePath
            );
        }

        $spreadsheet = IOFactory::load($filePath);

        $sheet = $spreadsheet->getSheetByName('勤怠記録')
            ?? $spreadsheet->getActiveSheet();

        $row = $this->findRow($sheet, $attendance->id);

        // A: 記録ID
        $sheet->setCellValue("A{$row}", $attendance->id);

        // B: 氏名
        $sheet->setCellValue(
            "B{$row}",
            $attendance->employee_name
        );

        // C: 勤務日
        $sheet->setCellValue(
            "C{$row}",
            $this->toExcelDate($attendance->work_date)
        );

        // D: 出勤時刻
        $sheet->setCellValue(
            "D{$row}",
            $this->toExcelDate($attendance->clock_in)
        );

        // E: 休憩開始時刻
        $sheet->setCellValue(
            "E{$row}",
            $this->toExcelDate($attendance->break_start)
        );

        // F: 休憩終了時刻
        $sheet->setCellValue(
            "F{$row}",
            $this->toExcelDate($attendance->break_end)
        );

        // G: 退勤時刻
        $sheet->setCellValue(
            "G{$row}",
            $this->toExcelDate($attendance->clock_out)
        );

        // H: 勤務状況
        $sheet->setCellValue(
            "H{$row}",
            $this->translateStatus($attendance->status)
        );

        // Định dạng ngày và thời gian
        $sheet->getStyle("C{$row}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');

        $sheet->getStyle("D{$row}:G{$row}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm:ss');

        IOFactory::createWriter($spreadsheet, 'Xlsx')
            ->save($filePath);

        $spreadsheet->disconnectWorksheets();
    }

    /**
     * Tìm dòng theo ID; nếu chưa có thì tìm dòng trống.
     */
    private function findRow($sheet, int $attendanceId): int
    {
        $firstDataRow = 6;
        $lastRow = max(55, $sheet->getHighestRow());

        for ($row = $firstDataRow; $row <= $lastRow; $row++) {
            $currentId = $sheet->getCell("A{$row}")->getValue();

            if ((string) $currentId === (string) $attendanceId) {
                return $row;
            }
        }

        for ($row = $firstDataRow; $row <= $lastRow; $row++) {
            $currentId = $sheet->getCell("A{$row}")->getValue();

            if ($currentId === null || $currentId === '') {
                return $row;
            }
        }

        return $lastRow + 1;
    }

    /**
     * Chuyển thời gian PHP thành giá trị ngày giờ của Excel.
     */
    private function toExcelDate(
        DateTimeInterface|string|null $value
    ): ?float {
        if ($value === null || $value === '') {
            return null;
        }

        $dateTime = $value instanceof DateTimeInterface
            ? Carbon::instance($value)
            : Carbon::parse($value);

        $dateTime->setTimezone(config('app.timezone'));

        return Date::PHPToExcel($dateTime);
    }

    /**
     * Chuyển trạng thái sang tiếng Nhật.
     */
    private function translateStatus(?string $status): string
    {
        return match ($status) {
            'working' => '勤務中',
            'break' => '休憩中',
            'offline' => 'オフライン',
            default => '未設定',
        };
    }
}