<?php

namespace App\Services;

use App\Exceptions\VisaProgressWorkbookException;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Throwable;

class VisaProgressSpreadsheetService
{
    /**
     * The workbook remains the source of truth. These aliases only identify
     * columns already present in the file; they never fabricate workbook data.
     *
     * @var array<string, list<string>>
     */
    private const HEADER_ALIASES = [
        'case_id' => ['案件ID', '案件番号', '管理番号', '受付番号', '受付ID', '申請ID'],
        'applicant_name' => ['申請者氏名', '申請者名', '氏名', '顧客名', 'お客様名'],
        'case_type' => ['申請種別', '案件種別', '手続き種類', '申請内容', '在留資格手続き'],
        'status' => ['全体ステータス', 'ステータス', '進捗状況', '申請状況', '状況'],
        'responsible_person' => ['担当者名', '担当者', '担当'],
        'application_date' => ['申請日', '申請予定日', '受付日', '申請年月日'],
    ];

    /** @var list<string> */
    private const DEADLINE_HEADERS = ['期限', '対応期限', '提出期限', '追加資料期限', '回答期限', '締切'];

    /**
     * @return array{applications: list<array<string, mixed>>, source_sheet: string}
     */
    public function parse(string $filePath): array
    {
        try {
            $spreadsheet = IOFactory::load($filePath);
        } catch (Throwable $exception) {
            throw new VisaProgressWorkbookException('Workbook could not be opened.', 0, $exception);
        }

        try {
            $selection = $this->selectDataSheet($spreadsheet);

            if ($selection === null) {
                throw new VisaProgressWorkbookException('A supported data sheet could not be identified.');
            }

            [$sheet, $headerRow, $columns, $deadlineColumns] = $selection;

            return [
                'applications' => $this->parseRows($sheet, $headerRow, $columns, $deadlineColumns),
                'source_sheet' => $sheet->getTitle(),
            ];
        } finally {
            $spreadsheet->disconnectWorksheets();
        }
    }

    /** @param list<array<string, mixed>> $applications */
    public function buildSummary(array $applications): array
    {
        return [
            'total' => count($applications),
            'in_review' => count(array_filter($applications, fn (array $application): bool => $this->isReviewStatus($application['status'] ?? null))),
            'additional_documents' => count(array_filter($applications, fn (array $application): bool => str_contains((string) ($application['status'] ?? ''), '追加資料'))),
            'approved' => count(array_filter($applications, fn (array $application): bool => $this->isApprovedStatus($application['status'] ?? null))),
            'attention_required' => count(array_filter($applications, fn (array $application): bool => in_array($application['deadline_level'] ?? null, ['overdue', 'critical', 'warning'], true))),
        ];
    }

    /**
     * @return array{0: Worksheet, 1: int, 2: array<string, int>, 3: array<int, string>}|null
     */
    private function selectDataSheet(Spreadsheet $spreadsheet): ?array
    {
        $preferredSheet = trim((string) config('services.google_drive.visa_progress_sheet'));

        if ($preferredSheet !== '') {
            $sheet = $spreadsheet->getSheetByName($preferredSheet);

            if ($sheet === null) {
                throw new VisaProgressWorkbookException('The configured worksheet could not be found.');
            }

            return $this->findSheetStructure($sheet);
        }

        $bestMatch = null;
        $bestScore = 0;

        foreach ($spreadsheet->getWorksheetIterator() as $sheet) {
            $structure = $this->findSheetStructure($sheet);

            if ($structure === null) {
                continue;
            }

            $score = count($structure[2]) + count($structure[3]);

            if ($score > $bestScore) {
                $bestMatch = $structure;
                $bestScore = $score;
            }
        }

        return $bestMatch;
    }

    /**
     * @return array{0: Worksheet, 1: int, 2: array<string, int>, 3: array<int, string>}|null
     */
    private function findSheetStructure(Worksheet $sheet): ?array
    {
        $highestRow = min(25, max(1, $sheet->getHighestDataRow()));
        $highestColumn = $sheet->getHighestDataColumn();
        $columnCount = Coordinate::columnIndexFromString($highestColumn);

        for ($row = 1; $row <= $highestRow; $row++) {
            $columns = [];
            $deadlineColumns = [];

            for ($column = 1; $column <= $columnCount; $column++) {
                $header = $this->normalizeHeader((string) $sheet->getCell([$column, $row])->getFormattedValue());

                if ($header === '') {
                    continue;
                }

                foreach (self::HEADER_ALIASES as $field => $aliases) {
                    if (! isset($columns[$field]) && $this->matchesAlias($header, $aliases)) {
                        $columns[$field] = $column;
                    }
                }

                if ($this->matchesAlias($header, self::DEADLINE_HEADERS)) {
                    $deadlineColumns[$column] = (string) $sheet->getCell([$column, $row])->getFormattedValue();
                }
            }

            $hasIdentity = isset($columns['case_id']) || isset($columns['applicant_name']);

            if ($hasIdentity && count($columns) + count($deadlineColumns) >= 2) {
                return [$sheet, $row, $columns, $deadlineColumns];
            }
        }

        return null;
    }

    /**
     * @param  array<string, int>  $columns
     * @param  array<int, string>  $deadlineColumns
     * @return list<array<string, mixed>>
     */
    private function parseRows(Worksheet $sheet, int $headerRow, array $columns, array $deadlineColumns): array
    {
        $applications = [];

        for ($row = $headerRow + 1; $row <= $sheet->getHighestDataRow(); $row++) {
            $values = [];

            foreach ($columns as $field => $column) {
                $cell = $sheet->getCell([$column, $row]);
                $values[$field] = in_array($field, ['application_date'], true)
                    ? $this->normalizeDate($cell)
                    : $this->normalizeText($this->cellValue($cell));
            }

            if (! $this->isDataRow($values)) {
                continue;
            }

            $deadlines = [];

            foreach ($deadlineColumns as $column => $label) {
                $date = $this->normalizeDate($sheet->getCell([$column, $row]));

                if ($date !== null) {
                    $deadlines[] = [
                        'label' => $this->normalizeText($label) ?? '期限',
                        'date' => $date,
                    ];
                }
            }

            $deadline = $this->selectOperationalDeadline($deadlines);
            $deadlineState = $this->deadlineState($deadline);
            $caseId = $values['case_id'] ?? null;

            $applications[] = [
                'id' => $caseId ?: $sheet->getTitle().':'.$row,
                'case_id' => $caseId,
                'applicant_name' => $values['applicant_name'] ?? null,
                'case_type' => $values['case_type'] ?? null,
                'status' => $values['status'] ?? null,
                'responsible_person' => $values['responsible_person'] ?? null,
                'application_date' => $values['application_date'] ?? null,
                'deadline' => $deadline,
                'deadlines' => $deadlines,
                'days_remaining' => $deadlineState['days_remaining'],
                'deadline_level' => $deadlineState['level'],
                'source_sheet' => $sheet->getTitle(),
                'source_row' => $row,
            ];
        }

        return $applications;
    }

    /** @param array<string, string|null> $values */
    private function isDataRow(array $values): bool
    {
        return ($values['case_id'] ?? null) !== null
            || ($values['applicant_name'] ?? null) !== null
            || ($values['status'] ?? null) !== null;
    }

    /** @param list<array{label: string, date: string}> $deadlines */
    private function selectOperationalDeadline(array $deadlines): ?string
    {
        if ($deadlines === []) {
            return null;
        }

        $today = Carbon::today('Asia/Tokyo');
        usort($deadlines, fn (array $left, array $right): int => $left['date'] <=> $right['date']);
        $upcoming = array_values(array_filter($deadlines, fn (array $deadline): bool => Carbon::parse($deadline['date'], 'Asia/Tokyo')->greaterThanOrEqualTo($today)));

        return ($upcoming[0] ?? $deadlines[array_key_last($deadlines)])['date'];
    }

    /** @return array{days_remaining: int|null, level: string} */
    private function deadlineState(?string $deadline): array
    {
        if ($deadline === null) {
            return ['days_remaining' => null, 'level' => 'none'];
        }

        $daysRemaining = Carbon::today('Asia/Tokyo')->diffInDays(Carbon::parse($deadline, 'Asia/Tokyo'), false);

        return [
            'days_remaining' => $daysRemaining,
            'level' => match (true) {
                $daysRemaining < 0 => 'overdue',
                $daysRemaining <= 5 => 'critical',
                $daysRemaining <= 10 => 'warning',
                default => 'normal',
            },
        ];
    }

    private function normalizeDate(Cell $cell): ?string
    {
        $value = $this->cellValue($cell);

        if ($value instanceof DateTimeInterface) {
            return Carbon::instance($value)->setTimezone('Asia/Tokyo')->toDateString();
        }

        if (is_numeric($value) && ExcelDate::isDateTime($cell)) {
            try {
                return Carbon::instance(ExcelDate::excelToDateTimeObject((float) $value))
                    ->setTimezone('Asia/Tokyo')
                    ->toDateString();
            } catch (Throwable) {
                return null;
            }
        }

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        if ($value === '') {
            return null;
        }

        foreach (['Y-m-d', 'Y/m/d', 'Y.m.d', 'Y年n月j日', 'Y年m月d日'] as $format) {
            try {
                $date = Carbon::createFromFormat($format, $value, 'Asia/Tokyo');

                if ($date !== false) {
                    return $date->toDateString();
                }
            } catch (Throwable) {
                // Try the next workbook date format.
            }
        }

        return null;
    }

    private function cellValue(Cell $cell): mixed
    {
        try {
            return $cell->getCalculatedValue();
        } catch (Throwable) {
            return $cell->getFormattedValue();
        }
    }

    private function normalizeText(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface || ! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : Str::squish($value);
    }

    /** @param list<string> $aliases */
    private function matchesAlias(string $header, array $aliases): bool
    {
        foreach ($aliases as $alias) {
            $normalizedAlias = $this->normalizeHeader($alias);

            if ($header === $normalizedAlias || str_contains($header, $normalizedAlias)) {
                return true;
            }
        }

        return false;
    }

    private function normalizeHeader(string $value): string
    {
        return str_replace([' ', '　', "\n", "\r", "\t"], '', trim($value));
    }

    private function isReviewStatus(?string $status): bool
    {
        return $status !== null && (str_contains($status, '審査') || str_contains($status, '確認') || str_contains($status, '対応中'));
    }

    private function isApprovedStatus(?string $status): bool
    {
        return $status !== null && str_contains($status, '許可') && ! str_contains($status, '不許可');
    }
}
