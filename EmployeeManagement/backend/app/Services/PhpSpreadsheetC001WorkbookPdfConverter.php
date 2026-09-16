<?php

namespace App\Services;

use App\Contracts\C001WorkbookPdfConverter;
use App\Exceptions\GeneratedDocumentDriveException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Writer\Pdf\Mpdf;
use Throwable;

class PhpSpreadsheetC001WorkbookPdfConverter implements C001WorkbookPdfConverter
{
    public function convert(string $workbookBytes): string
    {
        $sourcePath = tempnam(sys_get_temp_dir(), 'themis-c001-pdf-source-');
        $outputPath = tempnam(sys_get_temp_dir(), 'themis-c001-pdf-output-');
        if ($sourcePath === false || $outputPath === false) {
            throw new GeneratedDocumentDriveException('C-001 PDFの一時ファイルを作成できませんでした。');
        }

        try {
            file_put_contents($sourcePath, $workbookBytes);
            $spreadsheet = IOFactory::load($sourcePath);
            // Excel desktop fonts such as Yu Gothic are not installed on Railway.
            // Use mPDF's bundled CJK font only in the in-memory PDF copy so the
            // official workbook and master template remain byte-for-byte untouched.
            $spreadsheet->getDefaultStyle()->getFont()->setName('sun-exta');
            foreach ($spreadsheet->getAllSheets() as $sheet) {
                $sheet->getStyle($sheet->calculateWorksheetDimension())->getFont()->setName('sun-exta');
            }
            $writer = new Mpdf($spreadsheet);
            $writer->save($outputPath);
            $spreadsheet->disconnectWorksheets();

            $pdfBytes = file_get_contents($outputPath);
            if (! is_string($pdfBytes) || ! str_starts_with($pdfBytes, '%PDF-')) {
                throw new GeneratedDocumentDriveException('C-001 PDFを作成できませんでした。');
            }

            return $pdfBytes;
        } catch (GeneratedDocumentDriveException $error) {
            throw $error;
        } catch (Throwable) {
            throw new GeneratedDocumentDriveException('C-001 PDFへの変換に失敗しました。');
        } finally {
            @unlink($sourcePath);
            @unlink($outputPath);
        }
    }
}
