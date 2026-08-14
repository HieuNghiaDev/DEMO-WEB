<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\WorkSession;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Support\Facades\File;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
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
            $attendance->outside_destination,
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
            "N{$row}",
            "=IF(L{$row}=\"\",\"\",MAX(0,L{$row}-E{$row}-IF(OR(F{$row}=\"\",G{$row}=\"\"),0,G{$row}-F{$row})))"
        );

        $sheet->getStyle("D{$row}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');

        $sheet->getStyle("E{$row}:G{$row}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');

        $sheet->getStyle("I{$row}:L{$row}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');

        $sheet->getStyle("N{$row}")
            ->getNumberFormat()
            ->setFormatCode('[h]:mm');

        $this->applySheetDesign($sheet);
        $this->applyStatusStyle($sheet, $row, $attendance->status);

        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($filePath);
        $spreadsheet->disconnectWorksheets();
    }

    /** Ghi hoặc cập nhật một phiên công việc vào sheet riêng. */
    public function syncWorkSession(WorkSession $workSession): void
    {
        $filePath = storage_path('app/attendance/attendance.xlsx');

        File::ensureDirectoryExists(dirname($filePath));

        $spreadsheet = file_exists($filePath)
            ? IOFactory::load($filePath)
            : $this->createSpreadsheet();

        // Clean up legacy/duplicated columns in the attendance sheet whenever
        // a task is registered, so old exports are upgraded automatically.
        $attendanceSheet = $spreadsheet->getSheetByName('勤怠記録');

        if ($attendanceSheet !== null) {
            $this->prepareColumns($attendanceSheet);
            $this->clearPreviousLayout($attendanceSheet);
            $this->applySheetDesign($attendanceSheet);
        }

        $sheet = $spreadsheet->getSheetByName('作業記録');

        if ($sheet === null) {
            $sheet = $spreadsheet->createSheet();
            $sheet->setTitle('作業記録');
        }

        $this->prepareWorkSessionSheet($sheet);

        $workSession->loadMissing([
            'attendance.employee:id,employee_code',
        ]);
        $row = $this->findWorkSessionRow($sheet, $workSession->id);
        $attendance = $workSession->attendance;

        $sheet->fromArray([
            $workSession->id,
            $attendance?->employee?->employee_code,
            $attendance?->employee_name,
            $this->toExcelDate($attendance?->work_date),
            $workSession->task_description,
            $this->toExcelDate($workSession->started_at),
            $this->toExcelDate($workSession->expected_end_at),
            $this->toExcelDate($workSession->ended_at),
            $this->translateWorkSessionStatus($workSession->status),
        ], null, "A{$row}");

        $sheet->setCellValue(
            "J{$row}",
            "=IF(F{$row}=\"\",\"\",MAX(0,IF(H{$row}=\"\",NOW(),H{$row})-F{$row}))"
        );

        $sheet->getStyle("D{$row}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle("F{$row}:H{$row}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');
        $sheet->getStyle("J{$row}")
            ->getNumberFormat()
            ->setFormatCode('[h]:mm');

        $this->applyWorkSessionSheetDesign($sheet);
        $this->applyWorkSessionStatusStyle(
            $sheet,
            $row,
            $workSession->status
        );

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

        if ($sheet->getCell('H5')->getValue() !== '外出先・用件') {
            $sheet->insertNewColumnBefore('H');
        }

        $sheet->fromArray([
            '記録ID',
            '社員コード',
            '氏名',
            '勤務日',
            '出勤時刻',
            '休憩開始',
            '休憩終了',
            '外出先・用件',
            '外出時刻',
            '完了予定',
            '帰社時刻',
            '退勤時刻',
            '勤務状況',
            '実働時間',
        ], null, 'A5');

        $highestColumnIndex = Coordinate::columnIndexFromString(
            $sheet->getHighestColumn()
        );

        if ($highestColumnIndex > 14) {
            $sheet->removeColumn('O', $highestColumnIndex - 14);
        }
    }

    private function prepareWorkSessionSheet(Worksheet $sheet): void
    {
        foreach (array_keys($sheet->getMergeCells()) as $mergedRange) {
            $sheet->unmergeCells($mergedRange);
        }

        $sheet->fromArray([
            '記録ID',
            '社員コード',
            '氏名',
            '勤務日',
            '作業内容',
            '開始時刻',
            '完了予定',
            '完了時刻',
            '作業状況',
            '実績時間',
        ], null, 'A5');

        $highestColumnIndex = Coordinate::columnIndexFromString(
            $sheet->getHighestColumn()
        );

        if ($highestColumnIndex > 10) {
            $sheet->removeColumn('K', $highestColumnIndex - 10);
        }
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

        $sheet->mergeCells('A1:N2');
        $sheet->setCellValue('A1', '勤怠管理ダッシュボード / ATTENDANCE RECORD');
        $sheet->mergeCells('A3:N3');
        $sheet->setCellValue(
            'A3',
            '出勤・休憩・外出・退勤を一つの表で確認できます'
        );

        $sheet->mergeCells('A4:B4');
        $sheet->mergeCells('C4:D4');
        $sheet->mergeCells('E4:F4');
        $sheet->mergeCells('G4:H4');
        $sheet->mergeCells('I4:N4');

        $sheet->setCellValue('A4', '=COUNTIF($M$6:$M$'.$templateLastRow.',"勤務中")&" 名 勤務中"');
        $sheet->setCellValue('C4', '=COUNTIF($M$6:$M$'.$templateLastRow.',"休憩中")&" 名 休憩中"');
        $sheet->setCellValue('E4', '=COUNTIF($M$6:$M$'.$templateLastRow.',"外出中")&" 名 外出中"');
        $sheet->setCellValue('G4', '=COUNTIF($M$6:$M$'.$templateLastRow.',"オフライン")&" 件 完了"');
        $sheet->setCellValue('I4', '最終更新: '.now()->format('Y/m/d H:i'));

        $sheet->getStyle('A1:N2')->applyFromArray([
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

        $sheet->getStyle('A3:N3')->applyFromArray([
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
            'I4:N4' => ['F1F5F9', '475569'],
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

        $sheet->getStyle('A5:N5')->applyFromArray([
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

        $dataRange = 'A'.self::FIRST_DATA_ROW.':N'.$templateLastRow;
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
            $sheet->getStyle("A{$row}:N{$row}")
                ->getFill()
                ->setFillType(Fill::FILL_SOLID)
                ->getStartColor()
                ->setRGB($fillColor);

            $sheet->getStyle("A{$row}:B{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);

            $sheet->getStyle("D{$row}:G{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);

            $sheet->getStyle("H{$row}")
                ->getAlignment()
                ->setWrapText(true);

            $sheet->getStyle("I{$row}:N{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);

            $validation = $sheet->getCell("M{$row}")->getDataValidation();
            $validation->setType(DataValidation::TYPE_LIST);
            $validation->setErrorStyle(DataValidation::STYLE_STOP);
            $validation->setAllowBlank(true);
            $validation->setShowDropDown(true);
            $validation->setFormula1('"勤務中,休憩中,外出中,オフライン"');

            if (is_numeric($sheet->getCell("A{$row}")->getValue())) {
                $sheet->setCellValue(
                    "N{$row}",
                    "=IF(L{$row}=\"\",\"\",MAX(0,L{$row}-E{$row}-IF(OR(F{$row}=\"\",G{$row}=\"\"),0,G{$row}-F{$row})))"
                );

                $this->applyStatusStyleFromLabel($sheet, $row);
            }
        }

        $sheet->getStyle("D6:D{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle("E6:G{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');
        $sheet->getStyle("I6:L{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');
        $sheet->getStyle("N6:N{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('[h]:mm');

        $sheet->mergeCells("A{$legendRow}:N{$legendRow}");
        $sheet->setCellValue(
            "A{$legendRow}",
            'ステータス: 勤務中（緑）・休憩中（黄）・外出中（青）・オフライン（赤）'
        );
        $sheet->getStyle("A{$legendRow}:N{$legendRow}")->applyFromArray([
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
            'H' => 28,
            'I' => 12,
            'J' => 12,
            'K' => 12,
            'L' => 12,
            'M' => 13,
            'N' => 11,
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
        $sheet->setAutoFilter("A5:N{$templateLastRow}");
        $sheet->setShowGridlines(false);

        $sheet->getPageSetup()
            ->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)
            ->setFitToWidth(1)
            ->setFitToHeight(0)
            ->setPrintArea("A1:N{$legendRow}");

        $sheet->getPageMargins()
            ->setTop(0.35)
            ->setRight(0.25)
            ->setBottom(0.35)
            ->setLeft(0.25);

        $sheet->getColumnDimension('A')->setVisible(false);
    }

    private function applyWorkSessionSheetDesign(Worksheet $sheet): void
    {
        foreach (array_keys($sheet->getMergeCells()) as $mergedRange) {
            $sheet->unmergeCells($mergedRange);
        }

        $dataLastRow = $this->findLastWorkSessionRow($sheet);
        $templateLastRow = max(35, $dataLastRow + 5);
        $legendRow = $templateLastRow + 2;

        $sheet->mergeCells('A1:J2');
        $sheet->setCellValue('A1', '作業記録 / WORK SESSION LOG');
        $sheet->mergeCells('A3:J3');
        $sheet->setCellValue(
            'A3',
            '作業内容と予定・実績時間をシンプルに確認できます'
        );
        $sheet->mergeCells('A4:C4');
        $sheet->mergeCells('D4:F4');
        $sheet->mergeCells('G4:J4');
        $sheet->setCellValue(
            'A4',
            '=COUNTIF($I$6:$I$'.$templateLastRow.',"進行中")&" 件 進行中"'
        );
        $sheet->setCellValue(
            'D4',
            '=COUNTIF($I$6:$I$'.$templateLastRow.',"完了")&" 件 完了"'
        );
        $sheet->setCellValue('G4', '最終更新: '.now()->format('Y/m/d H:i'));

        $sheet->getStyle('A1:J2')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => '312E81'],
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

        $sheet->getStyle('A3:J3')->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'EEF2FF'],
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

        foreach ([
            'A4:C4' => ['E0E7FF', '4338CA'],
            'D4:F4' => ['DCFCE7', '15803D'],
            'G4:J4' => ['F1F5F9', '475569'],
        ] as $range => [$fillColor, $fontColor]) {
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
            ]);
        }

        $sheet->getStyle('A5:J5')->applyFromArray([
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

        $dataRange = 'A'.self::FIRST_DATA_ROW.':J'.$templateLastRow;
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
            $sheet->getStyle("A{$row}:J{$row}")
                ->getFill()
                ->setFillType(Fill::FILL_SOLID)
                ->getStartColor()
                ->setRGB($fillColor);
            $sheet->getStyle("B{$row}:D{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("E{$row}")
                ->getAlignment()
                ->setWrapText(true);
            $sheet->getStyle("F{$row}:J{$row}")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);

            if (is_numeric($sheet->getCell("A{$row}")->getValue())) {
                $sheet->setCellValue(
                    "J{$row}",
                    "=IF(F{$row}=\"\",\"\",MAX(0,IF(H{$row}=\"\",NOW(),H{$row})-F{$row}))"
                );
                $this->applyWorkSessionStatusStyleFromLabel($sheet, $row);
            }
        }

        $sheet->getStyle("D6:D{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle("F6:H{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('hh:mm');
        $sheet->getStyle("J6:J{$templateLastRow}")
            ->getNumberFormat()
            ->setFormatCode('[h]:mm');

        $sheet->mergeCells("A{$legendRow}:J{$legendRow}");
        $sheet->setCellValue(
            "A{$legendRow}",
            '作業状況: 進行中（青）・完了（緑）'
        );
        $sheet->getStyle("A{$legendRow}:J{$legendRow}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'F1F5F9'],
            ],
            'font' => [
                'italic' => true,
                'color' => ['rgb' => '64748B'],
                'size' => 9,
            ],
        ]);

        foreach ([
            'A' => 8,
            'B' => 12,
            'C' => 22,
            'D' => 12,
            'E' => 36,
            'F' => 12,
            'G' => 12,
            'H' => 12,
            'I' => 12,
            'J' => 12,
        ] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $sheet->getColumnDimension('A')->setVisible(false);
        $sheet->getRowDimension(1)->setRowHeight(28);
        $sheet->getRowDimension(2)->setRowHeight(18);
        $sheet->getRowDimension(3)->setRowHeight(22);
        $sheet->getRowDimension(4)->setRowHeight(26);
        $sheet->getRowDimension(5)->setRowHeight(30);
        $sheet->freezePane('B6');
        $sheet->setAutoFilter("B5:J{$templateLastRow}");
        $sheet->setShowGridlines(false);
        $sheet->getPageSetup()
            ->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)
            ->setFitToWidth(1)
            ->setFitToHeight(0)
            ->setPrintArea("B1:J{$legendRow}");
    }

    private function findWorkSessionRow(
        Worksheet $sheet,
        int $workSessionId
    ): int {
        $lastRow = max(35, $sheet->getHighestRow());

        for ($row = self::FIRST_DATA_ROW; $row <= $lastRow; $row++) {
            if ((string) $sheet->getCell("A{$row}")->getValue()
                === (string) $workSessionId) {
                return $row;
            }
        }

        for ($row = self::FIRST_DATA_ROW; $row <= $lastRow; $row++) {
            if ($sheet->getCell("A{$row}")->getValue() === null
                || $sheet->getCell("A{$row}")->getValue() === '') {
                return $row;
            }
        }

        return $this->findLastWorkSessionRow($sheet) + 1;
    }

    private function findLastWorkSessionRow(Worksheet $sheet): int
    {
        $lastDataRow = self::FIRST_DATA_ROW - 1;

        for ($row = self::FIRST_DATA_ROW; $row <= $sheet->getHighestRow(); $row++) {
            if (is_numeric($sheet->getCell("A{$row}")->getValue())) {
                $lastDataRow = $row;
            }
        }

        return $lastDataRow;
    }

    private function applyWorkSessionStatusStyle(
        Worksheet $sheet,
        int $row,
        ?string $status
    ): void {
        [$fillColor, $fontColor] = match ($status) {
            'active' => ['E0E7FF', '4338CA'],
            'completed' => ['DCFCE7', '15803D'],
            default => ['F1F5F9', '64748B'],
        };

        $sheet->getStyle("I{$row}")->applyFromArray([
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => $fillColor],
            ],
            'font' => [
                'bold' => true,
                'color' => ['rgb' => $fontColor],
            ],
        ]);
    }

    private function applyWorkSessionStatusStyleFromLabel(
        Worksheet $sheet,
        int $row
    ): void {
        $status = match ($sheet->getCell("I{$row}")->getValue()) {
            '進行中' => 'active',
            '完了' => 'completed',
            default => null,
        };

        $this->applyWorkSessionStatusStyle($sheet, $row, $status);
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

        $sheet->getStyle("M{$row}")->applyFromArray([
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
        $status = match ($sheet->getCell("M{$row}")->getValue()) {
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

    private function translateWorkSessionStatus(?string $status): string
    {
        return match ($status) {
            'active' => '進行中',
            'completed' => '完了',
            default => '未設定',
        };
    }
}
