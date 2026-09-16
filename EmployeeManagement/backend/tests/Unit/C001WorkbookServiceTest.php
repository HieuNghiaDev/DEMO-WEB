<?php

namespace Tests\Unit;

use App\Contracts\C001WorkbookPdfConverter;
use App\Exceptions\GeneratedDocumentDriveException;
use App\Services\C001WorkbookService;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

class C001WorkbookServiceTest extends TestCase
{
    public function test_it_changes_only_client_fields_and_success_fee_while_preserving_static_attorney_data(): void
    {
        $source = new Spreadsheet;
        $sheet = $source->getActiveSheet();
        $sheet->fromArray([
            ['委任契約書'],
            ['報酬金', '得られた金額の20％'],
            ['契約日', ''],
            ['委任する法律事務の範囲', ''],
            [],
            ['委任者', '', '', '住所', ''],
            ['', '', '', '氏名', ''],
            ['受任者', '', '', '住所', '大阪府松原市天美東１－８０－２２'],
            ['', '', '', '氏名', '弁護士　中峯将文'],
            ['', '', '通訳者', 'VU THI NGOC BICH'],
        ]);
        $sheet->getStyle('A1:E7')->getFont()->setName('Yu Gothic')->setSize(11);
        $sourceBytes = $this->save($source);

        $resultBytes = app(C001WorkbookService::class)->fill($sourceBytes, '山田 太郎', '大阪市北区1-2-3', '22');
        $result = $this->load($resultBytes);
        $resultSheet = $result->getActiveSheet();

        $this->assertSame('得られた金額の22%', $resultSheet->getCell('B2')->getValue());
        $this->assertNull($resultSheet->getCell('B3')->getValue());
        $this->assertNull($resultSheet->getCell('B4')->getValue());
        $this->assertSame('大阪市北区1-2-3', $resultSheet->getCell('E6')->getValue());
        $this->assertSame('山田 太郎', $resultSheet->getCell('E7')->getValue());
        $this->assertArrayHasKey('E6:I6', $resultSheet->getMergeCells());
        $this->assertArrayHasKey('E7:I7', $resultSheet->getMergeCells());
        $this->assertFalse($resultSheet->getStyle('E6')->getAlignment()->getWrapText());
        $this->assertFalse($resultSheet->getStyle('E7')->getAlignment()->getWrapText());
        $this->assertSame('大阪府松原市天美東１－８０－２２', $resultSheet->getCell('E8')->getValue());
        $this->assertSame('弁護士　中峯将文', $resultSheet->getCell('E9')->getValue());
        $this->assertSame('VU THI NGOC BICH', $resultSheet->getCell('D10')->getValue());
        $this->assertArrayHasKey('E8:I8', $resultSheet->getMergeCells());
        $this->assertArrayHasKey('E9:I9', $resultSheet->getMergeCells());
        $this->assertArrayHasKey('D10:I10', $resultSheet->getMergeCells());
        $this->assertSame('Yu Gothic', $resultSheet->getStyle('A1')->getFont()->getName());
        $result->disconnectWorksheets();
    }

    public function test_it_fails_closed_when_the_official_input_labels_are_missing(): void
    {
        $source = new Spreadsheet;
        $source->getActiveSheet()->setCellValue('A1', '別の書式');

        $this->expectException(GeneratedDocumentDriveException::class);
        app(C001WorkbookService::class)->fill($this->save($source), '山田 太郎', '大阪市北区', '20');
    }

    public function test_it_converts_the_actual_workbook_bytes_to_a_pdf(): void
    {
        $source = new Spreadsheet;
        $sheet = $source->getActiveSheet();
        $sheet->fromArray([
            ['委任契約書'],
            ['報酬金', '得られた金額の22%'],
            ['委任者', '', '', '住所', '大阪市北区1-2-3'],
            ['', '', '', '氏名', '山田 太郎'],
        ]);
        $sheet->getPageSetup()->setFitToWidth(1)->setFitToHeight(0);

        $pdf = app(C001WorkbookPdfConverter::class)->convert($this->save($source));

        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertGreaterThan(1000, strlen($pdf));
    }

    private function save(Spreadsheet $spreadsheet): string
    {
        $path = tempnam(sys_get_temp_dir(), 'c001-test-');
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($path);
        $spreadsheet->disconnectWorksheets();
        $bytes = file_get_contents($path);
        @unlink($path);

        return is_string($bytes) ? $bytes : '';
    }

    private function load(string $bytes): Spreadsheet
    {
        $path = tempnam(sys_get_temp_dir(), 'c001-result-');
        file_put_contents($path, $bytes);
        $spreadsheet = IOFactory::load($path);
        @unlink($path);

        return $spreadsheet;
    }
}
