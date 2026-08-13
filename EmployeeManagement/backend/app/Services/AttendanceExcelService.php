<?php

namespace App\Services;

use App\Models\Attendance;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Support\Facades\File;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class AttendanceExcelService
{
    private const FIRST_DATA_ROW = 6;

    /** Ghi hoặc cập nhật một bản chấm công trong file Excel. */
    public function sync(Attendance $attendance): void
    {
        $filePath = storage_path('app/attendance/attendance.xlsx');

        File::ensureDirectoryExists(dirname($filePath));

        $spreadsheet = file_exists($filePath)
            ? IOFactory::load($filePath)
            : $this->createSpreadsheet();

        $sheet = $spreadsheet->getSheetByName('勤怠記録')
            ?? $spreadsheet->getActiveSheet();

        $this->prepareColumns($sheet);
        $this->clearPreviousLayout($sheet);

        $attendance->loadMissing('employee:id,employee_code');
        $row = $this->findRow($sheet, $attendance->id);

        $values = [
            $attendance->id,
            $attendance->employee?->employee_code,
            $attendance->employee_name,
            $this->toExcelDate($attendance->work_date),
            $this->toExcelDate($attendance->clock_in),
            $this->toExcelDate($attendance->break_start),
            $this->toExcelDate($attendance->break_end),
            $this->toExcelDate($attendance->outside_start),
            $this->toExcelDate($attendance->outside_expected_end),
            $this->toExcelDate($attendance->outside_end),
            $this->toExcelDate($attendance->clock_out),
            $this->translateStatus($attendance->status),
        ];

        foreach ($values as $columnIndex => $value) {
            $column = chr(ord('A') + $columnIndex);
            $sheet->setCellValue("{$column}{$row}", $value);
        }

        $sheet->setCellValue(
            "M{$row}",
            "=IF(K{$row}=\"\",\"\",MAX(0,K{$row}-E{$row}-IF(OR(F{$row}=\"\",G{$row}=\"\"),0,G{$row}-F{$row})))"
        );

        $sheet->getStyle("D{$row}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');

        $sheet->getStyle("E{$row}:K{$row}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');

        $sheet->getStyle("M{$row}")
            ->getNumberFormat()
            ->setFormatCode('[h]:mm');

        $this->applySheetDesign($sheet);
        $this->applyStatusStyle($sheet, $row, $attendance->status);

        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($filePath);
        $spreadsheet->disconnectWorksheets();
    }

    private function createSpreadsheet(): Spreadsheet
    {
        $spreadsheet = new Spreadsheet;
        $spreadsheet->getActiveSheet()->setTitle('勤怠記録');

        return $spreadsheet;
    }

    /** Nâng cấp file 8 cột cũ mà không làm mất dữ liệu đã ghi. */
    private function prepareColumns(Worksheet $sheet): void
    {
        if ($sheet->getCell('B5')->getValue() !== '社員コード') {
            $sheet->insertNewColumnBefore('B');
        }

        if ($sheet->getCell('H5')->getValue() !== '外出時刻') {
            $sheet->insertNewColumnBefore('H', 3);
        }

        $sheet->fromArray([
            '記録ID',
            '社員コード',
            '氏名',
            '勤務日',
            '出勤時刻',
            '休憩開始',
            '休憩終了',
            '外出時刻',
            '完了予定',
            '帰社時刻',
            '退勤時刻',
            '勤務状況',
            '実働時間',
        ], null, 'A5');
    }

    /** Gỡ phần trang trí cũ trước khi tìm một dòng trống để ghi dữ liệu mới. */
    private function clearPreviousLayout(Worksheet $sheet): void
    {
        foreach (array_keys($sheet->getMergeCells()) as $mergedRange) {
            $sheet->unmergeCells($mergedRange);
        }

        for ($row = self::FIRST_DATA_ROW; $row <= $sheet->getHighestRow(); $row++) {
            $value = $sheet->getCell("A{$row}")->getValue();

            if (is_string($value) && str_starts_with($value, 'ステータス:')) {
                $sheet->setCellValue("A{$row}", null);
            }
        }
    }

    private function applySheetDesign(Worksheet $sheet): void
    {
        foreach (array_keys($sheet->getMergeCells()) as $mergedRange) {
            $sheet->unmergeCells($mergedRange);
        }

        $dataLastRow = $this->findLastDataRow($sheet);
        $templateLastRow = max(55, $dataLastRow + 5);
        $legendRow = $templateLastRow + 2;

        $sheet->mergeCells('A1:M2');
        $sheet->setCellValue('A1', '勤怠管理ダッシュボード / ATTENDANCE RECORD');
        $sheet->mergeCells('A3:M3');
        $sheet->setCellValue(
            'A3',
            '出勤・休憩・外出・退勤を一つの表で確認できます'
        );

        $sheet->mergeCells('A4:B4');
        $sheet->mergeCells('C4:D4');
        $sheet->mergeCells('E4:F4');
        $sheet->mergeCells('G4:H4');
        $sheet->mergeCells('I4:M4');

        $sheet->setCellValue('A4', '=COUNTIF($L$6:$L$'.$templateLastRow.',"勤務中")&" 名 勤務中"');
        $sheet->setCellValue('C4', '=COUNTIF($L$6:$L$'.$templateLastRow.',"休憩中")&" 名 休憩中"');
        $sheet->setCellValue('E4', '=COUNTIF($L$6:$L$'.$templateLastRow.',"外出中")&" 名 外出中"');
        $sheet->setCellValue('G4', '=COUNTIF($L$6:$L$'.$templateLastRow.',"オフライン")&" 件 完了"');
        $sheet->setCellValue('I4', '最終更新: '.now()->format('Y/m/d H:i'));

        $sheet->getStyle('A1:M2')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '172554'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
                'size' => 19,
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
            ],
        ]);

        $sheet->getStyle('A3:M3')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'EFF6FF'],
            ],
            'font' => [
                'italic' => true,
                'color' => ['rgb' => '475569'],
                'size' => 10,
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
            ],
        ]);

        $cardStyles = [
            'A4:B4' => ['DCFCE7', '166534'],
            'C4:D4' => ['FEF3C7', '92400E'],
            'E4:F4' => ['DBEAFE', '1D4ED8'],
            'G4:H4' => ['FEE2E2', 'B91C1C'],
            'I4:M4' => ['F1F5F9', '475569'],
        ];

        foreach ($cardStyles as $range => [$fillColor, $fontColor]) {
            $sheet->getStyle($range)->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => $fillColor],
                ],
                'font' => [
                    'bold' => true,
                    'color' => ['rgb' => $fontColor],
                    'size' => 10,
                ],
                'alignment' => [
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                    'vertical' => Alignment::VERTICAL_CENTER,
                ],
                'borders' => [
                    'bottom' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'FFFFFF'],
                    ],
                ],
            ]);
        }

        $sheet->getStyle('A5:M5')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '4F46E5'],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => 'FFFFFF'],
                'size' => 10,
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
                'wrapText' => true,
            ],
        ]);

        $dataRange = 'A'.self::FIRST_DATA_ROW.':M'.$templateLastRow;
        $sheet->getStyle($dataRange)->applyFromArray([
            'font' => [
                'color' => ['rgb' => '334155'],
                'size' => 9,
            ],
            'alignment' => [
                'vertical' => Alignment::VERTICAL_CENTER,
            ],
            'borders' => [
                'bottom' => [
                    'borderStyle' => Border::BORDER_HAIR,
                    'color' => ['rgb' => 'CBD5E1'],
                ],
            ],
        ]);

        for ($row = self::FIRST_DATA_ROW; $row <= $templateLastRow; $row++) {
            $fillColor = $row % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
            $sheet->getStyle("A{$row}:M{$row}")
                ->getFill()
                ->setFillType(Fill::FILL_SOLID)
                ->getStartColor()
                ->setRGB($fillColor);

            $sheet->getStyle("A{$row}:B{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);

            $sheet->getStyle("D{$row}:M{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);

            $validation = $sheet->getCell("L{$row}")->getDataValidation();
            $validation->setType(DataValidation::TYPE_LIST);
            $validation->setErrorStyle(DataValidation::STYLE_STOP);
            $validation->setAllowBlank(true);
            $validation->setShowDropDown(true);
            $validation->setFormula1('"勤務中,休憩中,外出中,オフライン"');

            if (is_numeric($sheet->getCell("A{$row}")->getValue())) {
                $sheet->setCellValue(
                    "M{$row}",
                    "=IF(K{$row}=\"\",\"\",MAX(0,K{$row}-E{$row}-IF(OR(F{$row}=\"\",G{$row}=\"\"),0,G{$row}-F{$row})))"
                );

                $this->applyStatusStyleFromLabel($sheet, $row);
            }
        }

        $sheet->getStyle("D6:D{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle("E6:K{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');
        $sheet->getStyle("M6:M{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('[h]:mm');

        $sheet->mergeCells("A{$legendRow}:M{$legendRow}");
        $sheet->setCellValue(
            "A{$legendRow}",
            'ステータス: 勤務中（緑）・休憩中（黄）・外出中（青）・オフライン（赤）'
        );
        $sheet->getStyle("A{$legendRow}:M{$legendRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'F1F5F9'],
            ],
            'font' => [
                'italic' => true,
                'color' => ['rgb' => '64748B'],
                'size' => 9,
            ],
            'alignment' => [
                'vertical' => Alignment::VERTICAL_CENTER,
            ],
        ]);

        $widths = [
            'A' => 9,
            'B' => 12,
            'C' => 23,
            'D' => 12,
            'E' => 12,
            'F' => 12,
            'G' => 12,
            'H' => 12,
            'I' => 12,
            'J' => 12,
            'K' => 12,
            'L' => 13,
            'M' => 11,
        ];

        foreach ($widths as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $sheet->getRowDimension(1)->setRowHeight(28);
        $sheet->getRowDimension(2)->setRowHeight(18);
        $sheet->getRowDimension(3)->setRowHeight(22);
        $sheet->getRowDimension(4)->setRowHeight(26);
        $sheet->getRowDimension(5)->setRowHeight(30);

        $sheet->freezePane('A6');
        $sheet->setAutoFilter("A5:M{$templateLastRow}");
        $sheet->setShowGridlines(false);

        $sheet->getPageSetup()
            ->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)
            ->setFitToWidth(1)
            ->setFitToHeight(0)
            ->setPrintArea("A1:M{$legendRow}");

        $sheet->getPageMargins()
            ->setTop(0.35)
            ->setRight(0.25)
            ->setBottom(0.35)
            ->setLeft(0.25);
    }

    private function findRow(Worksheet $sheet, int $attendanceId): int
    {
        $lastRow = max(55, $sheet->getHighestRow());

        for ($row = self::FIRST_DATA_ROW; $row <= $lastRow; $row++) {
            $currentId = $sheet->getCell("A{$row}")->getValue();

            if ((string) $currentId === (string) $attendanceId) {
                return $row;
            }
        }

        for ($row = self::FIRST_DATA_ROW; $row <= $lastRow; $row++) {
            $currentId = $sheet->getCell("A{$row}")->getValue();

            if ($currentId === null || $currentId === '') {
                return $row;
            }
        }

        return $this->findLastDataRow($sheet) + 1;
    }

    private function findLastDataRow(Worksheet $sheet): int
    {
        $lastDataRow = self::FIRST_DATA_ROW - 1;

        for ($row = self::FIRST_DATA_ROW; $row <= $sheet->getHighestRow(); $row++) {
            if (is_numeric($sheet->getCell("A{$row}")->getValue())) {
                $lastDataRow = $row;
            }
        }

        return $lastDataRow;
    }

    private function applyStatusStyle(
        Worksheet $sheet,
        int $row,
        ?string $status
    ): void {
        [$fillColor, $fontColor] = match ($status) {
            'working' => ['DCFCE7', '15803D'],
            'break' => ['FEF3C7', 'B45309'],
            'outside' => ['DBEAFE', '1D4ED8'],
            'offline' => ['FEE2E2', 'DC2626'],
            default => ['F1F5F9', '64748B'],
        };

        $sheet->getStyle("L{$row}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => $fillColor],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => $fontColor],
            ],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
            ],
        ]);
    }

    private function applyStatusStyleFromLabel(Worksheet $sheet, int $row): void
    {
        $status = match ($sheet->getCell("L{$row}")->getValue()) {
            '勤務中' => 'working',
            '休憩中' => 'break',
            '外出中' => 'outside',
            'オフライン' => 'offline',
            default => null,
        };

        $this->applyStatusStyle($sheet, $row, $status);
    }

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

    private function translateStatus(?string $status): string
    {
        return match ($status) {
            'working' => '勤務中',
            'break' => '休憩中',
            'outside' => '外出中',
            'offline' => 'オフライン',
            default => '未設定',
        };
    }
}
