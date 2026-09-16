<?php

namespace App\Services;

use App\Exceptions\GeneratedDocumentDriveException;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Throwable;

class C001WorkbookService
{
    public const MAPPED_FIELDS = ['client_name', 'client_address', 'success_fee_percentage'];

    private const PARTY_VALUE_END_COLUMN = 9;

    public function fill(string $sourceBytes, string $clientName, string $clientAddress, string $percentage): string
    {
        $sourcePath = tempnam(sys_get_temp_dir(), 'themis-c001-source-');
        $outputPath = tempnam(sys_get_temp_dir(), 'themis-c001-output-');
        if ($sourcePath === false || $outputPath === false) {
            throw new GeneratedDocumentDriveException('C-001の一時ファイルを作成できませんでした。');
        }

        try {
            file_put_contents($sourcePath, $sourceBytes);
            $spreadsheet = IOFactory::load($sourcePath);
            $sheet = $spreadsheet->getActiveSheet();

            $feeLabel = $this->findExactCell($sheet, '報酬金');
            $partyRow = $this->findClientPartyRow($sheet);
            $addressLabel = $this->findExactCell($sheet, '住所', $partyRow);
            $nameLabel = $this->findExactCell($sheet, '氏名', $partyRow);
            if ($feeLabel === null || $addressLabel === null || $nameLabel === null) {
                throw new GeneratedDocumentDriveException('C-001テンプレートの入力欄を確認できませんでした。');
            }

            $representativeLabel = $this->findExactCell($sheet, '受任者', $partyRow + 1);
            $representativeAddressLabel = $representativeLabel === null
                ? null
                : $this->findExactCell($sheet, '住所', $representativeLabel[1]);
            $representativeNameLabel = $representativeLabel === null
                ? null
                : $this->findExactCell($sheet, '氏名', $representativeLabel[1]);
            $interpreterLabel = $this->findExactCell($sheet, '通訳者', $partyRow + 1);

            $sheet->setCellValue([$feeLabel[0] + 1, $feeLabel[1]], '得られた金額の'.$percentage.'%');
            $sheet->setCellValue([$addressLabel[0] + 1, $addressLabel[1]], $clientAddress);
            $sheet->setCellValue([$nameLabel[0] + 1, $nameLabel[1]], $clientName);
            $this->formatPartyValueCell($sheet, $addressLabel);
            $this->formatPartyValueCell($sheet, $nameLabel);
            if ($representativeAddressLabel !== null) {
                $this->formatPartyValueCell($sheet, $representativeAddressLabel);
            }
            if ($representativeNameLabel !== null) {
                $this->formatPartyValueCell($sheet, $representativeNameLabel);
            }
            if ($interpreterLabel !== null) {
                $this->formatPartyValueCell($sheet, $interpreterLabel);
            }

            IOFactory::createWriter($spreadsheet, 'Xlsx')->save($outputPath);
            $spreadsheet->disconnectWorksheets();
            $result = file_get_contents($outputPath);
            if (! is_string($result) || $result === '') {
                throw new GeneratedDocumentDriveException('C-001の作業ファイルを作成できませんでした。');
            }

            return $result;
        } catch (GeneratedDocumentDriveException $error) {
            throw $error;
        } catch (Throwable) {
            throw new GeneratedDocumentDriveException('C-001テンプレートへの入力に失敗しました。');
        } finally {
            @unlink($sourcePath);
            @unlink($outputPath);
        }
    }

    /** @return array{int, int}|null */
    private function findExactCell(Worksheet $sheet, string $value, int $minimumRow = 1): ?array
    {
        for ($row = $minimumRow; $row <= $sheet->getHighestDataRow(); $row++) {
            $highestColumn = Coordinate::columnIndexFromString($sheet->getHighestDataColumn($row));
            for ($column = 1; $column <= $highestColumn; $column++) {
                if (trim((string) $sheet->getCell([$column, $row])->getValue()) === $value) {
                    return [$column, $row];
                }
            }
        }

        return null;
    }

    private function findClientPartyRow(Worksheet $sheet): int
    {
        for ($row = 1; $row <= $sheet->getHighestDataRow(); $row++) {
            $values = [];
            $highestColumn = Coordinate::columnIndexFromString($sheet->getHighestDataColumn($row));
            for ($column = 1; $column <= $highestColumn; $column++) {
                $values[] = trim((string) $sheet->getCell([$column, $row])->getValue());
            }
            if (in_array('委任者', $values, true) && in_array('住所', $values, true)) {
                return $row;
            }
        }

        throw new GeneratedDocumentDriveException('C-001テンプレートの委任者欄を確認できませんでした。');
    }

    /** @param array{int, int} $label */
    private function formatPartyValueCell(Worksheet $sheet, array $label): void
    {
        $firstColumn = $label[0] + 1;
        $row = $label[1];
        $range = Coordinate::stringFromColumnIndex($firstColumn).$row
            .':'.Coordinate::stringFromColumnIndex(self::PARTY_VALUE_END_COLUMN).$row;

        if (! isset($sheet->getMergeCells()[$range])) {
            $sheet->mergeCells($range);
        }

        $sheet->getStyle([$firstColumn, $row])->getAlignment()
            ->setWrapText(false)
            ->setShrinkToFit(false);
    }
}
