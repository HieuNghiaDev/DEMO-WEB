<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class PersonalAttendanceReportService
{
    private const ATTENDANCE_FIRST_ROW = 9;

    private const WORK_SESSION_FIRST_ROW = 8;

    private const PERIOD_FIRST_ROW = 7;

    public function build(Employee $employee): Spreadsheet
    {
        $employee->loadMissing('office');

        $attendances = Attendance::query()
            ->where('employee_id', $employee->id)
            ->with([
                'periods',
                'workSessions' => fn ($query) => $query->orderBy('started_at'),
            ])
            ->orderBy('work_date')
            ->orderBy('clock_in')
            ->get();

        $spreadsheet = new Spreadsheet;
        $spreadsheet->getDefaultStyle()->getFont()
            ->setName('Yu Gothic')
            ->setSize(10);
        $spreadsheet->getProperties()
            ->setCreator('THEMIS Workspace')
            ->setTitle('個人勤怠表')
            ->setSubject('社員本人用の勤怠・作業記録');

        $attendanceSheet = $spreadsheet->getActiveSheet();
        $attendanceSheet->setTitle('勤怠サマリー');
        $periodLastRow = max(
            self::PERIOD_FIRST_ROW,
            self::PERIOD_FIRST_ROW
                + $attendances->sum(
                    fn (Attendance $attendance) => $attendance->periods->count()
                ) - 1
        );
        $this->buildAttendanceSheet(
            $attendanceSheet,
            $employee,
            $attendances,
            $periodLastRow
        );

        $workSessionSheet = $spreadsheet->createSheet();
        $workSessionSheet->setTitle('作業記録');
        $this->buildWorkSessionSheet(
            $workSessionSheet,
            $employee,
            $attendances
        );

        $periodSheet = $spreadsheet->createSheet();
        $periodSheet->setTitle('勤務履歴');
        $this->buildPeriodSheet($periodSheet, $employee, $attendances);

        $spreadsheet->setActiveSheetIndex(0);

        return $spreadsheet;
    }

    /** @param Collection<int, Attendance> $attendances */
    private function buildAttendanceSheet(
        Worksheet $sheet,
        Employee $employee,
        Collection $attendances,
        int $periodLastRow
    ): void {
        $lastRow = max(
            self::ATTENDANCE_FIRST_ROW,
            self::ATTENDANCE_FIRST_ROW + $attendances->count() - 1
        );

        $latestAttendance = $attendances->last();

        $sheet->mergeCells('A1:I1');
        $sheet->setCellValue('A1', '個人勤怠表 / PERSONAL ATTENDANCE');
        $sheet->mergeCells('A2:F2');
        $sheet->setCellValue('A2', 'THEMIS WORKSPACE  •  EMPLOYEE REPORT');
        $sheet->mergeCells('G2:I2');
        $sheet->setCellValue('G2', '出力日時  '.now()->format('Y/m/d H:i'));
        $sheet->mergeCells('A3:F3');
        $sheet->setCellValueExplicit(
            'A3',
            $this->employeeSummary($employee),
            DataType::TYPE_STRING
        );
        $sheet->mergeCells('G3:I3');
        $sheet->setCellValue('G3', '本人専用・社外秘');

        $sheet->mergeCells('A5:B5');
        $sheet->mergeCells('A6:B6');
        $sheet->mergeCells('C5:D5');
        $sheet->mergeCells('C6:D6');
        $sheet->mergeCells('E5:F5');
        $sheet->mergeCells('E6:F6');
        $sheet->mergeCells('G5:I5');
        $sheet->mergeCells('G6:I6');
        $sheet->setCellValue('A5', '勤務回数');
        $sheet->setCellValue(
            'A6',
            '=COUNTA(A'.self::ATTENDANCE_FIRST_ROW.':A'.$lastRow.')&" 回"'
        );
        $sheet->setCellValue('C5', '実働合計');
        $sheet->setCellValue(
            'C6',
            '=SUM(I'.self::ATTENDANCE_FIRST_ROW.':I'.$lastRow.')'
        );
        $sheet->setCellValue('E5', '休憩合計');
        $sheet->setCellValue(
            'E6',
            '=SUM(E'.self::ATTENDANCE_FIRST_ROW.':E'.$lastRow.')'
        );
        $sheet->setCellValue('G5', '現在の状態');
        $sheet->setCellValue(
            'G6',
            $latestAttendance instanceof Attendance
                ? $this->translateAttendanceStatus($latestAttendance->status)
                : '記録なし'
        );

        $sheet->mergeCells('A7:I7');
        $sheet->setCellValue('A7', '勤怠明細  /  ATTENDANCE DETAILS');

        $headers = [
            '日付',
            '出勤',
            '退勤',
            '休憩回数',
            '休憩合計',
            '外出回数',
            '外出合計',
            'ステータス',
            '実働時間',
        ];
        $sheet->fromArray($headers, null, 'A8');

        foreach ($attendances->values() as $index => $attendance) {
            $row = self::ATTENDANCE_FIRST_ROW + $index;
            $sheet->setCellValue("A{$row}", $this->toExcelDate($attendance->work_date));
            $sheet->setCellValue("B{$row}", $this->toExcelDate($attendance->clock_in));
            $sheet->setCellValue("C{$row}", $this->toExcelDate($attendance->clock_out));
            $sheet->setCellValue("D{$row}", $attendance->periods->where('type', 'break')->count());
            $sheet->setCellValue("E{$row}", "=SUMIFS('勤務履歴'!\$H\$".self::PERIOD_FIRST_ROW.":\$H\${$periodLastRow},'勤務履歴'!\$A\$".self::PERIOD_FIRST_ROW.":\$A\${$periodLastRow},J{$row},'勤務履歴'!\$C\$".self::PERIOD_FIRST_ROW.":\$C\${$periodLastRow},\"休憩\")");
            $sheet->setCellValue("F{$row}", $attendance->periods->where('type', 'outside')->count());
            $sheet->setCellValue("G{$row}", "=SUMIFS('勤務履歴'!\$H\$".self::PERIOD_FIRST_ROW.":\$H\${$periodLastRow},'勤務履歴'!\$A\$".self::PERIOD_FIRST_ROW.":\$A\${$periodLastRow},J{$row},'勤務履歴'!\$C\$".self::PERIOD_FIRST_ROW.":\$C\${$periodLastRow},\"外出\")");
            $sheet->setCellValue("H{$row}", $this->translateAttendanceStatus($attendance->status));
            $sheet->setCellValue(
                "I{$row}",
                "=IF(OR(B{$row}=\"\",C{$row}=\"\"),\"\",MAX(0,C{$row}-B{$row}-E{$row}))"
            );
            $sheet->setCellValue("J{$row}", $attendance->id);
        }

        $this->applyAttendanceDesign($sheet, $lastRow, $attendances->isNotEmpty());

        foreach ($attendances->values() as $index => $attendance) {
            $row = self::ATTENDANCE_FIRST_ROW + $index;
            $this->styleStatusCell($sheet, "H{$row}", $attendance->status);
        }
    }

    /** @param Collection<int, Attendance> $attendances */
    private function buildPeriodSheet(
        Worksheet $sheet,
        Employee $employee,
        Collection $attendances
    ): void {
        $periods = $attendances
            ->flatMap(fn (Attendance $attendance) => $attendance->periods)
            ->sortBy('started_at')
            ->values();
        $lastRow = max(
            self::PERIOD_FIRST_ROW,
            self::PERIOD_FIRST_ROW + $periods->count() - 1
        );

        $sheet->mergeCells('A1:H1');
        $sheet->setCellValue('A1', '休憩・外出履歴 / ACTIVITY PERIODS');
        $sheet->mergeCells('A2:E2');
        $sheet->setCellValue('A2', '1勤務内のすべての休憩・外出を記録');
        $sheet->mergeCells('F2:H2');
        $sheet->setCellValue('F2', '出力日時  '.now()->format('Y/m/d H:i'));
        $sheet->mergeCells('A3:H3');
        $sheet->setCellValueExplicit('A3', $this->employeeSummary($employee), DataType::TYPE_STRING);

        $sheet->fromArray([
            '勤怠ID', '日付', '種類', '外出先・用件',
            '開始', '完了予定', '終了実績', '時間',
        ], null, 'A6');

        foreach ($periods as $index => $period) {
            $row = self::PERIOD_FIRST_ROW + $index;
            $sheet->setCellValue("A{$row}", $period->attendance_id);
            $sheet->setCellValue("B{$row}", $this->toExcelDate($period->started_at));
            $sheet->setCellValue("C{$row}", $period->type === 'break' ? '休憩' : '外出');
            $sheet->setCellValueExplicit("D{$row}", (string) ($period->destination ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue("E{$row}", $this->toExcelDate($period->started_at));
            $sheet->setCellValue("F{$row}", $this->toExcelDate($period->expected_end_at));
            $sheet->setCellValue("G{$row}", $this->toExcelDate($period->ended_at));
            $sheet->setCellValue("H{$row}", "=IF(OR(E{$row}=\"\",G{$row}=\"\"),\"\",MAX(0,G{$row}-E{$row}))");
        }

        $this->applyPeriodDesign($sheet, $lastRow, $periods->isNotEmpty());
    }

    /** @param Collection<int, Attendance> $attendances */
    private function buildWorkSessionSheet(
        Worksheet $sheet,
        Employee $employee,
        Collection $attendances
    ): void {
        $workSessions = $attendances
            ->flatMap(fn (Attendance $attendance) => $attendance->workSessions)
            ->sortBy('started_at')
            ->values();
        $lastRow = max(
            self::WORK_SESSION_FIRST_ROW,
            self::WORK_SESSION_FIRST_ROW + $workSessions->count() - 1
        );

        $sheet->mergeCells('A1:H1');
        $sheet->setCellValue('A1', '作業記録 / WORK SESSION LOG');
        $sheet->mergeCells('A2:E2');
        $sheet->setCellValue('A2', 'REGISTERED TASKS & ACTUAL PERFORMANCE');
        $sheet->mergeCells('F2:H2');
        $sheet->setCellValue('F2', '出力日時  '.now()->format('Y/m/d H:i'));
        $sheet->mergeCells('A3:H3');
        $sheet->setCellValueExplicit(
            'A3',
            $this->employeeSummary($employee),
            DataType::TYPE_STRING
        );

        $sheet->mergeCells('A5:B5');
        $sheet->mergeCells('A6:B6');
        $sheet->mergeCells('C5:D5');
        $sheet->mergeCells('C6:D6');
        $sheet->mergeCells('E5:F5');
        $sheet->mergeCells('E6:F6');
        $sheet->mergeCells('G5:H5');
        $sheet->mergeCells('G6:H6');
        $sheet->setCellValue('A5', '登録作業');
        $sheet->setCellValue(
            'A6',
            '=COUNTA(A'.self::WORK_SESSION_FIRST_ROW.':A'.$lastRow.')&" 件"'
        );
        $sheet->setCellValue('C5', '予定時間');
        $sheet->setCellValue(
            'C6',
            '=SUM(F'.self::WORK_SESSION_FIRST_ROW.':F'.$lastRow.')'
        );
        $sheet->setCellValue('E5', '実績時間');
        $sheet->setCellValue(
            'E6',
            '=SUM(G'.self::WORK_SESSION_FIRST_ROW.':G'.$lastRow.')'
        );
        $sheet->setCellValue('G5', '完了');
        $sheet->setCellValue(
            'G6',
            '=COUNTIF(H'.self::WORK_SESSION_FIRST_ROW.':H'.$lastRow.',"完了")&" 件"'
        );

        $headers = [
            '日付',
            '作業内容',
            '開始',
            '完了予定',
            '完了実績',
            '予定時間',
            '実績時間',
            'ステータス',
        ];
        $sheet->fromArray($headers, null, 'A7');

        foreach ($workSessions as $index => $workSession) {
            $row = self::WORK_SESSION_FIRST_ROW + $index;
            $sheet->setCellValue("A{$row}", $this->toExcelDate($workSession->started_at));
            $sheet->setCellValueExplicit(
                "B{$row}",
                $workSession->task_description,
                DataType::TYPE_STRING
            );
            $sheet->setCellValue("C{$row}", $this->toExcelDate($workSession->started_at));
            $sheet->setCellValue("D{$row}", $this->toExcelDate($workSession->expected_end_at));
            $sheet->setCellValue("E{$row}", $this->toExcelDate($workSession->ended_at));
            $sheet->setCellValue("F{$row}", "=IF(OR(C{$row}=\"\",D{$row}=\"\"),\"\",MAX(0,D{$row}-C{$row}))");
            $sheet->setCellValue("G{$row}", "=IF(OR(C{$row}=\"\",E{$row}=\"\"),\"\",MAX(0,E{$row}-C{$row}))");
            $sheet->setCellValue("H{$row}", $this->translateWorkSessionStatus($workSession->status));
        }

        $this->applyWorkSessionDesign($sheet, $lastRow, $workSessions->isNotEmpty());

        foreach ($workSessions as $index => $workSession) {
            $row = self::WORK_SESSION_FIRST_ROW + $index;
            $this->styleStatusCell($sheet, "H{$row}", $workSession->status);
        }
    }

    private function applyAttendanceDesign(
        Worksheet $sheet,
        int $lastRow,
        bool $hasData
    ): void {
        $this->styleTitle($sheet, 'A1:I1');
        $this->styleSubtitle($sheet, 'A2:F2', Alignment::HORIZONTAL_LEFT);
        $this->styleSubtitle($sheet, 'G2:I2', Alignment::HORIZONTAL_RIGHT);
        $this->styleEmployeeLine($sheet, 'A3:F3');
        $sheet->getStyle('G3:I3')->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'F8FAFC']],
            'font' => ['bold' => true, 'color' => ['rgb' => 'DC2626'], 'size' => 9],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_RIGHT,
                'vertical' => Alignment::VERTICAL_CENTER,
                'indent' => 1,
            ],
            'borders' => [
                'bottom' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['rgb' => 'E2E8F0']],
            ],
        ]);
        $sheet->getRowDimension(4)->setRowHeight(9);

        foreach ([
            ['A5:B5', 'A6:B6', 'EFF6FF', '2563EB', '1E3A8A'],
            ['C5:D5', 'C6:D6', 'ECFDF5', '059669', '065F46'],
            ['E5:F5', 'E6:F6', 'F5F3FF', '7C3AED', '5B21B6'],
            ['G5:I5', 'G6:I6', 'FFF7ED', 'EA580C', '9A3412'],
        ] as [$labelRange, $valueRange, $fillColor, $accentColor, $valueColor]) {
            $this->styleMetricCard(
                $sheet,
                $labelRange,
                $valueRange,
                $fillColor,
                $accentColor,
                $valueColor
            );
        }
        $sheet->getStyle('C6:F6')
            ->getNumberFormat()
            ->setFormatCode('[h]"時間"mm"分"');
        $this->styleSection($sheet, 'A7:I7');
        $this->styleHeader($sheet, 'A8:I8');
        $this->styleDataRows($sheet, 'A', 'I', self::ATTENDANCE_FIRST_ROW, $lastRow);

        if ($hasData) {
            $sheet->setAutoFilter("A8:I{$lastRow}");
        }

        $sheet->getStyle('A'.self::ATTENDANCE_FIRST_ROW.':A'.$lastRow)
            ->getNumberFormat()->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle('B'.self::ATTENDANCE_FIRST_ROW.':C'.$lastRow)
            ->getNumberFormat()->setFormatCode('hh:mm');
        $sheet->getStyle('E'.self::ATTENDANCE_FIRST_ROW.':E'.$lastRow)
            ->getNumberFormat()->setFormatCode('[h]:mm');
        $sheet->getStyle('G'.self::ATTENDANCE_FIRST_ROW.':G'.$lastRow)
            ->getNumberFormat()->setFormatCode('[h]:mm');
        $sheet->getStyle('I'.self::ATTENDANCE_FIRST_ROW.':I'.$lastRow)
            ->getNumberFormat()->setFormatCode('[h]:mm');
        $sheet->getStyle('A'.self::ATTENDANCE_FIRST_ROW.':I'.$lastRow)
            ->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        foreach ([
            'A' => 13, 'B' => 11, 'C' => 11, 'D' => 11, 'E' => 13,
            'F' => 11, 'G' => 11, 'H' => 14, 'I' => 13,
        ] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $sheet->getColumnDimension('J')->setVisible(false);

        $sheet->getTabColor()->setRGB('4F46E5');
        $this->finishSheet($sheet, 'A9', "A1:I{$lastRow}");
    }

    private function applyPeriodDesign(
        Worksheet $sheet,
        int $lastRow,
        bool $hasData
    ): void {
        $this->styleTitle($sheet, 'A1:H1');
        $this->styleSubtitle($sheet, 'A2:E2', Alignment::HORIZONTAL_LEFT);
        $this->styleSubtitle($sheet, 'F2:H2', Alignment::HORIZONTAL_RIGHT);
        $this->styleEmployeeLine($sheet, 'A3:H3');
        $sheet->getRowDimension(4)->setRowHeight(9);
        $this->styleHeader($sheet, 'A6:H6');
        $this->styleDataRows($sheet, 'A', 'H', self::PERIOD_FIRST_ROW, $lastRow);

        if ($hasData) {
            $sheet->setAutoFilter("B6:H{$lastRow}");
        }

        $sheet->getStyle('B'.self::PERIOD_FIRST_ROW.':B'.$lastRow)
            ->getNumberFormat()->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle('E'.self::PERIOD_FIRST_ROW.':G'.$lastRow)
            ->getNumberFormat()->setFormatCode('hh:mm');
        $sheet->getStyle('H'.self::PERIOD_FIRST_ROW.':H'.$lastRow)
            ->getNumberFormat()->setFormatCode('[h]:mm');
        $sheet->getStyle('B'.self::PERIOD_FIRST_ROW.':C'.$lastRow)
            ->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getStyle('D'.self::PERIOD_FIRST_ROW.':D'.$lastRow)
            ->getAlignment()->setWrapText(true);
        $sheet->getStyle('E'.self::PERIOD_FIRST_ROW.':H'.$lastRow)
            ->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        foreach ([
            'A' => 10, 'B' => 13, 'C' => 10, 'D' => 34,
            'E' => 11, 'F' => 12, 'G' => 12, 'H' => 12,
        ] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $sheet->getColumnDimension('A')->setVisible(false);
        $sheet->getTabColor()->setRGB('0EA5E9');
        $this->finishSheet($sheet, 'B7', "B1:H{$lastRow}");
    }

    private function applyWorkSessionDesign(
        Worksheet $sheet,
        int $lastRow,
        bool $hasData
    ): void {
        $this->styleTitle($sheet, 'A1:H1');
        $this->styleSubtitle($sheet, 'A2:E2', Alignment::HORIZONTAL_LEFT);
        $this->styleSubtitle($sheet, 'F2:H2', Alignment::HORIZONTAL_RIGHT);
        $this->styleEmployeeLine($sheet, 'A3:H3');
        $sheet->getRowDimension(4)->setRowHeight(9);

        foreach ([
            ['A5:B5', 'A6:B6', 'EFF6FF', '2563EB', '1E3A8A'],
            ['C5:D5', 'C6:D6', 'F5F3FF', '7C3AED', '5B21B6'],
            ['E5:F5', 'E6:F6', 'ECFDF5', '059669', '065F46'],
            ['G5:H5', 'G6:H6', 'FFF7ED', 'EA580C', '9A3412'],
        ] as [$labelRange, $valueRange, $fillColor, $accentColor, $valueColor]) {
            $this->styleMetricCard(
                $sheet,
                $labelRange,
                $valueRange,
                $fillColor,
                $accentColor,
                $valueColor
            );
        }
        $sheet->getStyle('C6:F6')
            ->getNumberFormat()
            ->setFormatCode('[h]"時間"mm"分"');
        $this->styleHeader($sheet, 'A7:H7');
        $this->styleDataRows($sheet, 'A', 'H', self::WORK_SESSION_FIRST_ROW, $lastRow);

        if ($hasData) {
            $sheet->setAutoFilter("A7:H{$lastRow}");
        }

        $sheet->getStyle('A'.self::WORK_SESSION_FIRST_ROW.':A'.$lastRow)
            ->getNumberFormat()->setFormatCode('yyyy/mm/dd');
        $sheet->getStyle('C'.self::WORK_SESSION_FIRST_ROW.':E'.$lastRow)
            ->getNumberFormat()->setFormatCode('hh:mm');
        $sheet->getStyle('F'.self::WORK_SESSION_FIRST_ROW.':G'.$lastRow)
            ->getNumberFormat()->setFormatCode('[h]:mm');
        $sheet->getStyle('B'.self::WORK_SESSION_FIRST_ROW.':B'.$lastRow)
            ->getAlignment()
            ->setHorizontal(Alignment::HORIZONTAL_LEFT)
            ->setWrapText(true);
        $sheet->getStyle('A'.self::WORK_SESSION_FIRST_ROW.':A'.$lastRow)
            ->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getStyle('C'.self::WORK_SESSION_FIRST_ROW.':H'.$lastRow)
            ->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        foreach ([
            'A' => 13, 'B' => 42, 'C' => 11, 'D' => 12,
            'E' => 12, 'F' => 13, 'G' => 13, 'H' => 14,
        ] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $sheet->getTabColor()->setRGB('10B981');
        $this->finishSheet($sheet, 'A8', "A1:H{$lastRow}");
    }

    private function styleTitle(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '172554']],
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 18],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_LEFT,
                'vertical' => Alignment::VERTICAL_CENTER,
                'indent' => 1,
            ],
        ]);
        $sheet->getRowDimension(1)->setRowHeight(38);
    }

    private function styleSubtitle(
        Worksheet $sheet,
        string $range,
        string $horizontalAlignment
    ): void {
        $sheet->getStyle($range)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'EEF2FF']],
            'font' => ['bold' => true, 'color' => ['rgb' => '4F46E5'], 'size' => 9],
            'alignment' => [
                'horizontal' => $horizontalAlignment,
                'vertical' => Alignment::VERTICAL_CENTER,
                'indent' => 1,
            ],
        ]);
        $sheet->getRowDimension(2)->setRowHeight(22);
    }

    private function styleEmployeeLine(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'F8FAFC']],
            'font' => ['bold' => true, 'color' => ['rgb' => '1E293B'], 'size' => 10],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_LEFT,
                'vertical' => Alignment::VERTICAL_CENTER,
                'indent' => 1,
            ],
            'borders' => [
                'bottom' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['rgb' => 'E2E8F0']],
            ],
        ]);
        $sheet->getRowDimension(3)->setRowHeight(26);
    }

    private function styleMetricCard(
        Worksheet $sheet,
        string $labelRange,
        string $valueRange,
        string $fillColor,
        string $accentColor,
        string $valueColor
    ): void {
        $border = [
            'outline' => [
                'borderStyle' => Border::BORDER_THIN,
                'color' => ['rgb' => 'DCE3EE'],
            ],
        ];

        $sheet->getStyle($labelRange)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $fillColor]],
            'font' => ['bold' => true, 'color' => ['rgb' => $accentColor], 'size' => 9],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_BOTTOM,
            ],
            'borders' => $border,
        ]);
        $sheet->getStyle($valueRange)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $fillColor]],
            'font' => ['bold' => true, 'color' => ['rgb' => $valueColor], 'size' => 14],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_TOP,
            ],
            'borders' => $border,
        ]);
        $sheet->getRowDimension(5)->setRowHeight(19);
        $sheet->getRowDimension(6)->setRowHeight(27);
    }

    private function styleSection(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'F1F5F9']],
            'font' => ['bold' => true, 'color' => ['rgb' => '475569'], 'size' => 9],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_LEFT,
                'vertical' => Alignment::VERTICAL_CENTER,
                'indent' => 1,
            ],
        ]);
        $sheet->getRowDimension(7)->setRowHeight(22);
    }

    private function styleHeader(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '3730A3']],
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 10],
            'alignment' => [
                'horizontal' => Alignment::HORIZONTAL_CENTER,
                'vertical' => Alignment::VERTICAL_CENTER,
                'wrapText' => true,
            ],
        ]);
        $headerRow = (int) preg_replace('/\D+/', '', explode(':', $range)[0]);
        $sheet->getRowDimension($headerRow)->setRowHeight(30);
    }

    private function styleDataRows(
        Worksheet $sheet,
        string $firstColumn,
        string $lastColumn,
        int $firstRow,
        int $lastRow
    ): void {
        $sheet->getStyle("{$firstColumn}{$firstRow}:{$lastColumn}{$lastRow}")
            ->applyFromArray([
                'font' => ['color' => ['rgb' => '334155'], 'size' => 9.5],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER],
                'borders' => [
                    'bottom' => [
                        'borderStyle' => Border::BORDER_THIN,
                        'color' => ['rgb' => 'E2E8F0'],
                    ],
                ],
            ]);

        for ($row = $firstRow; $row <= $lastRow; $row++) {
            $fillColor = $row % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
            $sheet->getStyle("{$firstColumn}{$row}:{$lastColumn}{$row}")
                ->getFill()->setFillType(Fill::FILL_SOLID)
                ->getStartColor()->setRGB($fillColor);
            $sheet->getRowDimension($row)->setRowHeight(26);
        }
    }

    private function finishSheet(
        Worksheet $sheet,
        string $freezePane,
        string $printArea
    ): void {
        $sheet->freezePane($freezePane);
        $sheet->setShowGridlines(false);
        $sheet->setSelectedCell('A1');
        $sheet->getSheetView()->setZoomScale(120);
        $sheet->getPageSetup()
            ->setOrientation('landscape')
            ->setPaperSize(PageSetup::PAPERSIZE_A4)
            ->setHorizontalCentered(true)
            ->setFitToWidth(1)
            ->setFitToHeight(0)
            ->setPrintArea($printArea);
        $sheet->getPageMargins()
            ->setTop(0.4)
            ->setRight(0.3)
            ->setBottom(0.45)
            ->setLeft(0.3);
        $sheet->getHeaderFooter()
            ->setOddFooter('&LTHEMIS Workspace&CConfidential&RPage &P / &N');
    }

    private function styleStatusCell(
        Worksheet $sheet,
        string $cell,
        ?string $status
    ): void {
        [$fillColor, $fontColor] = match ($status) {
            'working', 'active' => ['E0E7FF', '4338CA'],
            'break' => ['FEF3C7', 'B45309'],
            'outside' => ['DBEAFE', '1D4ED8'],
            'offline', 'completed' => ['DCFCE7', '15803D'],
            default => ['F1F5F9', '64748B'],
        };

        $sheet->getStyle($cell)->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $fillColor]],
            'font' => ['bold' => true, 'color' => ['rgb' => $fontColor]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
    }

    private function employeeSummary(Employee $employee): string
    {
        $parts = array_filter([
            $employee->employee_code,
            $employee->full_name,
            $employee->work_email,
            $employee->office?->name,
        ]);

        return implode('  •  ', $parts);
    }

    private function toExcelDate(DateTimeInterface|string|null $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $dateTime = $value instanceof DateTimeInterface
            ? Carbon::instance($value)
            : Carbon::parse($value);
        $dateTime->setTimezone(config('app.timezone'));

        return Date::PHPToExcel($dateTime);
    }

    private function translateAttendanceStatus(?string $status): string
    {
        return match ($status) {
            'working' => '勤務中',
            'break' => '休憩中',
            'outside' => '外出中',
            'offline' => '勤務終了',
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
