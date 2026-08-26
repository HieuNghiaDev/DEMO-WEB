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
        'message_link' => ['メッセージリンク', 'メッセージURL', 'Messengerリンク'],
    ];

    /** @var list<string> */
    private const DEADLINE_HEADERS = ['期限', '対応期限', '提出期限', '追加資料期限', '回答期限', '締切'];

    private const RESIDENCE_DEADLINE_STATUSES = ['新規受付', '申請準備完了'];

    private const SUPPLEMENT_DEADLINE_STATUSES = ['審査中', '追加資料依頼①', '追加資料依頼②', '追加資料依頼③'];

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
            $personRecords = $this->parseNamedSheet($spreadsheet, '本人情報');
            $materialRecords = $this->parseNamedSheet($spreadsheet, '資料管理');
            $billingRecords = $this->parseNamedSheet($spreadsheet, '請求関係');

            if ($personRecords !== [] && $materialRecords !== []) {
                return [
                    'applications' => $this->mergeOperationalRecords($personRecords, $materialRecords, $billingRecords),
                    'source_sheet' => '本人情報 / 資料管理 / 請求関係',
                ];
            }

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

    /** @return list<array<string, mixed>> */
    private function parseNamedSheet(Spreadsheet $spreadsheet, string $sheetName): array
    {
        $sheet = $spreadsheet->getSheetByName($sheetName);

        if ($sheet === null) {
            return [];
        }

        $structure = $this->findSheetStructure($sheet);

        if ($structure === null) {
            return [];
        }

        [, $headerRow, $columns, $deadlineColumns] = $structure;

        return $this->parseRows($sheet, $headerRow, $columns, $deadlineColumns);
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

            $selectedDeadline = $this->selectOperationalDeadline($deadlines);
            $deadlineState = $this->deadlineState($selectedDeadline['date'] ?? null);
            $caseId = $values['case_id'] ?? null;

            $applications[] = [
                'id' => $caseId ?: $sheet->getTitle().':'.$row,
                'case_id' => $caseId,
                'applicant_name' => $values['applicant_name'] ?? null,
                'case_type' => $values['case_type'] ?? null,
                'status' => $values['status'] ?? null,
                'responsible_person' => $values['responsible_person'] ?? null,
                'application_date' => $values['application_date'] ?? null,
                'deadline' => $selectedDeadline['date'] ?? null,
                'deadline_label' => $selectedDeadline['label'] ?? null,
                'deadline_category' => $selectedDeadline['category'] ?? 'general',
                'deadlines' => $deadlines,
                'days_remaining' => $deadlineState['days_remaining'],
                'deadline_level' => $deadlineState['level'],
                'source_sheet' => $sheet->getTitle(),
                'source_row' => $row,
                'message_link' => $this->normalizeMessageLink($values['message_link'] ?? null),
            ];
        }

        return $applications;
    }

    /**
     * The workbook stores case facts across sheets. Only the operational
     * status groups below make their corresponding date actionable:
     * residence-expiry dates for intake/preparation and supplemental-document
     * due dates for review/additional-document work.
     *
     * @param  list<array<string, mixed>>  $personRecords
     * @param  list<array<string, mixed>>  $materialRecords
     * @param  list<array<string, mixed>>  $billingRecords
     * @return list<array<string, mixed>>
     */
    private function mergeOperationalRecords(array $personRecords, array $materialRecords, array $billingRecords): array
    {
        $peopleByCaseId = $this->recordsByCaseId($personRecords);
        $materialsByCaseId = $this->recordsByCaseId($materialRecords);
        $billingByCaseId = $this->recordsByCaseId($billingRecords);
        $caseIds = array_values(array_unique([
            ...array_keys($peopleByCaseId),
            ...array_keys($materialsByCaseId),
            ...array_keys($billingByCaseId),
        ]));

        return array_map(function (string $caseId) use ($peopleByCaseId, $materialsByCaseId, $billingByCaseId): array {
            $person = $peopleByCaseId[$caseId] ?? [];
            $material = $materialsByCaseId[$caseId] ?? [];
            $billing = $billingByCaseId[$caseId] ?? [];
            $status = $this->firstString($person['status'] ?? null, $material['status'] ?? null, $billing['status'] ?? null);
            $deadlines = [
                ...$this->eligibleResidenceDeadlines($person),
                ...$this->eligibleSupplementDeadlines($material),
            ];
            $selectedDeadline = $this->selectOperationalDeadline($deadlines);
            $deadlineState = $this->deadlineState($selectedDeadline['date'] ?? null);

            return [
                'id' => $caseId,
                'case_id' => $caseId,
                'applicant_name' => $this->firstString($person['applicant_name'] ?? null, $material['applicant_name'] ?? null, $billing['applicant_name'] ?? null),
                'case_type' => $person['case_type'] ?? null,
                'status' => $status,
                'responsible_person' => $this->firstString($person['responsible_person'] ?? null, $material['responsible_person'] ?? null),
                'application_date' => $person['application_date'] ?? null,
                'deadline' => $selectedDeadline['date'] ?? null,
                'deadline_label' => $selectedDeadline['label'] ?? null,
                'deadline_category' => $selectedDeadline['category'] ?? null,
                'deadlines' => $deadlines,
                'days_remaining' => $deadlineState['days_remaining'],
                'deadline_level' => $deadlineState['level'],
                'source_sheet' => '本人情報 / 資料管理',
                'source_row' => $person['source_row'] ?? $material['source_row'] ?? 0,
                'message_link' => $this->normalizeMessageLink($billing['message_link'] ?? null),
            ];
        }, $caseIds);
    }

    /**
     * @param  list<array<string, mixed>>  $records
     * @return array<string, array<string, mixed>>
     */
    private function recordsByCaseId(array $records): array
    {
        $indexed = [];

        foreach ($records as $record) {
            $caseId = $record['case_id'] ?? null;

            if (is_string($caseId) && $caseId !== '') {
                $indexed[$caseId] = $record;
            }
        }

        return $indexed;
    }

    /** @param array<string, mixed> $record
     * @return list<array{label: string, date: string, category: string}>
     */
    private function eligibleResidenceDeadlines(array $record): array
    {
        if (! in_array($record['status'] ?? null, self::RESIDENCE_DEADLINE_STATUSES, true)) {
            return [];
        }

        return $this->matchingDeadlines($record['deadlines'] ?? [], '在留期限', 'residence');
    }

    /** @param array<string, mixed> $record
     * @return list<array{label: string, date: string, category: string}>
     */
    private function eligibleSupplementDeadlines(array $record): array
    {
        if (! in_array($record['status'] ?? null, self::SUPPLEMENT_DEADLINE_STATUSES, true)) {
            return [];
        }

        return $this->matchingDeadlines($record['deadlines'] ?? [], '追完期限', 'supplement');
    }

    /**
     * @return list<array{label: string, date: string, category: string}>
     */
    private function matchingDeadlines(mixed $deadlines, string $headerNeedle, string $category): array
    {
        if (! is_array($deadlines)) {
            return [];
        }

        return array_values(array_filter(array_map(function (mixed $deadline) use ($headerNeedle, $category): ?array {
            if (! is_array($deadline) || ! is_string($deadline['label'] ?? null) || ! is_string($deadline['date'] ?? null)) {
                return null;
            }

            if (! str_contains($this->normalizeHeader($deadline['label']), $this->normalizeHeader($headerNeedle))) {
                return null;
            }

            return [
                'label' => $this->normalizeText($deadline['label']) ?? $headerNeedle,
                'date' => $deadline['date'],
                'category' => $category,
            ];
        }, $deadlines)));
    }

    private function firstString(mixed ...$values): ?string
    {
        foreach ($values as $value) {
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    /** @param array<string, string|null> $values */
    private function isDataRow(array $values): bool
    {
        return ($values['case_id'] ?? null) !== null
            || ($values['applicant_name'] ?? null) !== null
            || ($values['status'] ?? null) !== null;
    }

    /** @param list<array{label: string, date: string, category?: string}> $deadlines
     * @return array{label: string, date: string, category?: string}|null
     */
    private function selectOperationalDeadline(array $deadlines): ?array
    {
        if ($deadlines === []) {
            return null;
        }

        $today = Carbon::today('Asia/Tokyo');
        usort($deadlines, fn (array $left, array $right): int => $left['date'] <=> $right['date']);
        $upcoming = array_values(array_filter($deadlines, fn (array $deadline): bool => Carbon::parse($deadline['date'], 'Asia/Tokyo')->greaterThanOrEqualTo($today)));

        return $upcoming[0] ?? $deadlines[array_key_last($deadlines)];
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

    private function normalizeMessageLink(mixed $value): ?string
    {
        $url = $this->normalizeText($value);

        if ($url === null || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        if ($scheme !== 'https' || ! in_array($host, ['facebook.com', 'www.facebook.com', 'm.me', 'messenger.com', 'www.messenger.com'], true)) {
            return null;
        }

        return $url;
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
