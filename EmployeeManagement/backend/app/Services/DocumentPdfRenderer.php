<?php

namespace App\Services;

use App\Models\CaseGeneratedDocument;
use Illuminate\Validation\ValidationException;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;

class DocumentPdfRenderer
{
    public function __construct(private GenericLegalDocumentRenderer $legalRenderer) {}

    public function render(CaseGeneratedDocument $document): string
    {
        if ($document->workflow_status !== 'approved' || $document->approved_data === null) {
            throw ValidationException::withMessages(['workflow_status' => '承認済みの文書のみPDFをダウンロードできます。']);
        }
        $document->loadMissing('template.documentType');
        $html = match ($document->template->renderer_type) {
            'generic_legal_document' => $this->legalRenderer->html($document),
            default => throw ValidationException::withMessages(['template' => 'この文書のPDF形式は未対応です。']),
        };
        $pdf = new Mpdf([
            'mode' => 'utf-8', 'format' => 'A4', 'orientation' => 'P',
            'margin_left' => 22, 'margin_right' => 22, 'margin_top' => 20, 'margin_bottom' => 22,
            'default_font' => 'sun-exta', 'default_font_size' => 11,
            // Private font metrics cache only; no generated PDF is written to disk.
            'tempDir' => storage_path('framework/cache/document-pdf'),
        ]);
        $pdf->SetTitle($document->template->documentType->name_ja ?: '文書');
        $pdf->SetCreator('THEMIS');
        $pdf->SetHTMLFooter('<div style="text-align:center;font-size:9pt;color:#666">{PAGENO} / {nbpg}</div>');
        $pdf->WriteHTML('<style>body { color:#17202b; font-family:sun-exta; font-size:11pt; line-height:1.7; } h1 {font-size:20pt;text-align:center;letter-spacing:1mm;margin:8mm 0 10mm;} h2 {font-size:13pt;margin:7mm 0 2mm;padding-bottom:1.5mm;border-bottom:0.2mm solid #aeb7c2;} h3 {font-size:11pt;margin:5mm 0 2mm;} p {margin:2mm 0;white-space:pre-wrap;} .metadata,.label {font-size:9pt;color:#56616d;} .field {margin-bottom:5mm;border-bottom:0.2mm solid #d7dce1;padding-bottom:4mm;} .value {font-size:11pt;word-wrap:break-word;} .notice {margin-top:9mm;font-size:9pt;color:#56616d;} table {width:100%;margin:2mm 0 5mm;border-collapse:collapse;page-break-inside:avoid;} td,th {padding:2.2mm;border:0.2mm solid #b9c1ca;vertical-align:top;word-wrap:break-word;} th {width:28%;background:#f3f5f7;color:#46515e;text-align:left;} ul,ol {margin:2mm 0 5mm;padding-left:7mm;}</style>'.$html);

        return $pdf->Output('', Destination::STRING_RETURN);
    }

    public function filename(CaseGeneratedDocument $document, int $caseId): string
    {
        $document->loadMissing('template.documentType');
        $field = collect($document->template->field_schema)->firstWhere('source', 'client.name');
        $client = $field ? ($document->approved_data[$field['key']] ?? '') : '';
        $parts = [$document->template->documentType->code ?: 'document', 'v'.$document->version, $document->template->documentType->name_ja ?: '文書', 'case-'.$caseId, $client ?: 'client'];

        return implode('_', array_map(function ($part) {
            $safe = preg_replace('/[\p{C}<>:"\/\\\\|?*%]+/u', '_', (string) $part);
            $safe = trim(str_replace('..', '_', $safe), ". \t\n\r\0\x0B");

            return mb_substr($safe ?: 'document', 0, 40);
        }, $parts)).'.pdf';
    }
}
