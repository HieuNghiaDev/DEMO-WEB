<?php

namespace App\Services;

use App\Contracts\C001WorkbookPdfConverter;
use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class C001DocumentWorkflowService
{
    public const ARTIFACT_TYPE = 'source_workbook';

    public const PDF_ARTIFACT_TYPE = 'pdf';

    public function __construct(
        private GoogleDriveService $drive,
        private GoogleDriveProvisioningService $folders,
        private C001WorkbookService $workbook,
        private C001WorkbookPdfConverter $pdfConverter,
        private DocumentGenerationService $documents,
    ) {}

    /** @return array{instance: CaseGeneratedDocument, action: string, fee_changed: bool} */
    public function sync(CaseFile $caseFile, CaseDocument $caseDocument, User $actor, string $percentage): array
    {
        $percentage = $this->normalizePercentage($percentage);

        return Cache::lock('c001-document-sync:'.$caseDocument->id, 120)->block(5, function () use ($caseFile, $caseDocument, $actor, $percentage) {
            $context = DB::transaction(function () use ($caseFile, $caseDocument) {
                $case = CaseFile::query()->whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
                $document = $case->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
                $this->assertC001($document);
                $document->loadMissing(['caseFile.client', 'documentType']);
                $clientName = trim((string) $document->caseFile?->client?->name);
                $clientAddress = trim((string) $document->caseFile?->client?->address);
                $missing = [];
                if ($clientName === '') {
                    $missing['client_name'] = '依頼者氏名が登録されていません。';
                }
                if ($clientAddress === '') {
                    $missing['client_address'] = '依頼者住所が登録されていません。';
                }
                if ($missing !== []) {
                    throw ValidationException::withMessages($missing);
                }

                $instance = $document->generatedDocuments()->orderByDesc('version')->lockForUpdate()->first();
                $officialWorkbook = $instance?->artifacts()
                    ->where('artifact_type', self::ARTIFACT_TYPE)
                    ->where('storage_provider', 'google_drive')
                    ->first();
                $officialPdf = $instance?->artifacts()
                    ->where('artifact_type', self::PDF_ARTIFACT_TYPE)
                    ->where('storage_provider', 'google_drive')
                    ->first();
                if (! $instance || $instance->workflow_status !== 'review') {
                    throw ValidationException::withMessages([
                        'workflow_status' => 'プレビューで内容を確認したC-001のみDriveへ保存できます。',
                    ]);
                }

                return [
                    'case' => $case,
                    'document' => $document,
                    'instance' => $instance,
                    'client_name' => $clientName,
                    'client_address' => $clientAddress,
                    'official_workbook' => $officialWorkbook,
                    'official_pdf' => $officialPdf,
                    'previous_percentage' => $this->formatPercentage($instance->success_fee_percentage),
                ];
            });

            // A finalized C-001 version is a pair. Retrying a completed pair is
            // idempotent, while a legacy/partial pair is completed in place.
            if ($context['official_workbook'] || $context['official_pdf']) {
                if ($context['previous_percentage'] !== $percentage) {
                    throw ValidationException::withMessages([
                        'workflow_status' => '保存済みの版は変更できません。文書を編集して次の版を作成してください。',
                    ]);
                }
            }

            if ($context['official_workbook'] && $context['official_pdf']) {
                return [
                    'instance' => $context['instance']->fresh(['artifacts', 'approvedBy:id,name']),
                    'action' => 'existing',
                    'fee_changed' => false,
                ];
            }
            if ($context['official_pdf'] && ! $context['official_workbook']) {
                throw new GeneratedDocumentDriveException('C-001 PDFの元となるExcelを確認できません。管理者に確認してください。');
            }

            $master = null;
            if ($context['official_workbook']) {
                $filledBytes = $this->drive->downloadFileContent($context['official_workbook']->external_file_id);
            } else {
                $templateFolderId = trim((string) config('services.google_drive.c001_template_folder_id'));
                $templateFilename = trim((string) config('services.google_drive.c001_template_file_name'));
                if ($templateFolderId === '' || $templateFilename === '') {
                    throw new GeneratedDocumentDriveException('C-001のテンプレート設定が不足しています。');
                }
                $master = $this->drive->resolveExactTemplateFile(
                    $templateFolderId,
                    $templateFilename,
                    config('services.google_drive.c001_template_file_id')
                );
                $filledBytes = $this->workbook->fill(
                    $this->drive->downloadFileContent($master['id']),
                    $context['client_name'],
                    $context['client_address'],
                    $percentage
                );
            }

            // Convert before any upload. The PDF and XLSX therefore always come
            // from the exact same populated workbook state.
            $pdfBytes = $this->pdfConverter->convert($filledBytes);
            $folder = $this->folders->provisionGeneratedDocuments($context['case']);
            $workbookFilename = $this->filename($context['case'], $context['instance'], $context['client_name']);
            if ($context['official_workbook']) {
                $workbookRemote = [
                    'id' => $context['official_workbook']->external_file_id,
                    'url' => $context['official_workbook']->external_url,
                    'name' => $context['official_workbook']->filename,
                ];
            } else {
                $workbookKey = hash('sha256', config('app.key').'|c001|'.$context['document']->id.'|'.$context['instance']->version);
                $workbookRemote = $this->drive->ensureGeneratedWorkbookCopy(
                    $master['id'],
                    $folder->external_folder_id,
                    $workbookFilename,
                    $workbookKey
                );
                $this->drive->replaceWorkbookContent($workbookRemote['id'], $master['id'], $filledBytes);
            }

            $pdfRemote = $context['official_pdf'] ? [
                'external_file_id' => $context['official_pdf']->external_file_id,
                'external_url' => $context['official_pdf']->external_url,
                'filename' => $context['official_pdf']->filename,
            ] : $this->drive->storeGeneratedPdf(
                $pdfBytes,
                $this->pdfFilename($workbookFilename),
                $folder->external_folder_id,
                hash('sha256', config('app.key').'|c001-pdf|'.$context['document']->id.'|'.$context['instance']->version)
            );

            $instance = DB::transaction(function () use ($context, $actor, $percentage, $workbookRemote, $filledBytes, $pdfRemote, $pdfBytes) {
                $document = CaseDocument::query()->whereKey($context['document']->id)->lockForUpdate()->firstOrFail();
                $instance = CaseGeneratedDocument::query()->whereKey($context['instance']->id)->lockForUpdate()->firstOrFail();
                $existingWorkbook = $instance->artifacts()
                    ->where('artifact_type', self::ARTIFACT_TYPE)
                    ->where('storage_provider', 'google_drive')
                    ->first();
                $existingPdf = $instance->artifacts()
                    ->where('artifact_type', self::PDF_ARTIFACT_TYPE)
                    ->where('storage_provider', 'google_drive')
                    ->first();
                $instance->update([
                    'workflow_status' => 'review',
                    'success_fee_percentage' => $percentage,
                    'updated_by' => $actor->id,
                ]);

                if (! $existingWorkbook) {
                    $instance->artifacts()->create([
                        'artifact_type' => self::ARTIFACT_TYPE,
                        'storage_provider' => 'google_drive',
                        'external_file_id' => $workbookRemote['id'],
                        'external_url' => $workbookRemote['url'],
                        'filename' => $workbookRemote['name'],
                        'mime_type' => GoogleDriveService::XLSX_MIME_TYPE,
                        'checksum' => hash('sha256', $filledBytes),
                        'uploaded_by' => $actor->id,
                        'uploaded_at' => now(),
                    ]);
                }
                if (! $existingPdf) {
                    $instance->artifacts()->create([
                        'artifact_type' => self::PDF_ARTIFACT_TYPE,
                        'storage_provider' => 'google_drive',
                        'external_file_id' => $pdfRemote['external_file_id'],
                        'external_url' => $pdfRemote['external_url'],
                        'filename' => $pdfRemote['filename'],
                        'mime_type' => 'application/pdf',
                        'checksum' => hash('sha256', $pdfBytes),
                        'uploaded_by' => $actor->id,
                        'uploaded_at' => now(),
                    ]);
                }
                $document->update([
                    'collection_status' => 'received',
                    'fulfillment_status' => 'satisfied',
                    'review_status' => 'reviewing',
                ]);

                return $instance->fresh(['artifacts', 'approvedBy:id,name']);
            });

            return [
                'instance' => $instance,
                'action' => 'generated',
                'fee_changed' => $context['previous_percentage'] !== $percentage,
            ];
        });
    }

    /** @return array{bytes: string, source: string, template_name: string, version: int} */
    public function previewPdf(CaseFile $caseFile, CaseDocument $caseDocument, ?int $version = null): array
    {
        $document = $caseFile->documents()->whereKey($caseDocument->id)->firstOrFail();
        $this->assertC001($document);
        $document->loadMissing('caseFile.client');
        $instances = $document->generatedDocuments();
        $instance = $version === null
            ? $instances->orderByDesc('version')->first()
            : $instances->where('version', $version)->firstOrFail();
        if (! $instance || ! in_array($instance->workflow_status, ['review', 'approved'], true)) {
            throw ValidationException::withMessages([
                'workflow_status' => 'C-001の設定をプレビューへ進めてください。',
            ]);
        }

        $clientName = trim((string) $document->caseFile?->client?->name);
        $clientAddress = trim((string) $document->caseFile?->client?->address);
        $missing = [];
        if ($clientName === '') {
            $missing['client_name'] = '依頼者氏名が登録されていません。';
        }
        if ($clientAddress === '') {
            $missing['client_address'] = '依頼者住所が登録されていません。';
        }
        if ($missing !== []) {
            throw ValidationException::withMessages($missing);
        }

        $artifact = $instance->artifacts()->where('artifact_type', self::ARTIFACT_TYPE)
            ->where('storage_provider', 'google_drive')->first();
        // An artifact marks an immutable finalized version. Workflow-only changes
        // such as rejection must not make its saved workbook appear stale.
        $artifactIsCurrent = $artifact && is_string($artifact->external_file_id)
            && trim($artifact->external_file_id) !== '';

        if ($artifactIsCurrent) {
            $workbookBytes = $this->drive->downloadFileContent($artifact->external_file_id);
            $source = 'saved_working_copy';
        } else {
            $templateFolderId = trim((string) config('services.google_drive.c001_template_folder_id'));
            $templateFilename = trim((string) config('services.google_drive.c001_template_file_name'));
            if ($templateFolderId === '' || $templateFilename === '') {
                throw new GeneratedDocumentDriveException('C-001のテンプレート設定が不足しています。');
            }
            $master = $this->drive->resolveExactTemplateFile(
                $templateFolderId,
                $templateFilename,
                config('services.google_drive.c001_template_file_id')
            );
            $workbookBytes = $this->workbook->fill(
                $this->drive->downloadFileContent($master['id']),
                $clientName,
                $clientAddress,
                $this->normalizePercentage($instance->success_fee_percentage ?? 20)
            );
            $source = 'temporary_working_copy';
        }

        return [
            'bytes' => $this->pdfConverter->convert($workbookBytes),
            'source' => $source,
            'template_name' => trim((string) config('services.google_drive.c001_template_file_name')),
            'version' => $instance->version,
        ];
    }

    /** @return array{bytes: string, filename: string, version: int} */
    public function download(CaseFile $caseFile, CaseDocument $caseDocument, ?int $version = null): array
    {
        $document = $caseFile->documents()->whereKey($caseDocument->id)->firstOrFail();
        $this->assertC001($document);
        $instances = $document->generatedDocuments();
        if ($version !== null) {
            $instances->where('version', $version);
        }
        $instance = $instances
            ->whereHas('artifacts', fn ($query) => $query
                ->where('artifact_type', self::ARTIFACT_TYPE)
                ->where('storage_provider', 'google_drive'))
            ->orderByDesc('version')
            ->firstOrFail();
        $artifact = $instance->artifacts()
            ->where('artifact_type', self::ARTIFACT_TYPE)
            ->where('storage_provider', 'google_drive')
            ->firstOrFail();
        abort_unless(is_string($artifact->external_file_id) && trim($artifact->external_file_id) !== '', 404);

        return [
            'bytes' => $this->drive->downloadFileContent($artifact->external_file_id),
            'filename' => $artifact->filename ?: 'C-001_v'.$instance->version.'.xlsx',
            'version' => $instance->version,
        ];
    }

    /** @return array{bytes: string, filename: string, version: int} */
    public function downloadPdf(CaseFile $caseFile, CaseDocument $caseDocument, ?int $version = null): array
    {
        $document = $caseFile->documents()->whereKey($caseDocument->id)->firstOrFail();
        $this->assertC001($document);
        $instances = $document->generatedDocuments();
        if ($version !== null) {
            $instances->where('version', $version);
        }
        $instance = $instances
            ->whereHas('artifacts', fn ($query) => $query
                ->where('artifact_type', self::PDF_ARTIFACT_TYPE)
                ->where('storage_provider', 'google_drive'))
            ->orderByDesc('version')
            ->firstOrFail();
        $artifact = $instance->artifacts()
            ->where('artifact_type', self::PDF_ARTIFACT_TYPE)
            ->where('storage_provider', 'google_drive')
            ->firstOrFail();
        abort_unless(is_string($artifact->external_file_id) && trim($artifact->external_file_id) !== '', 404);

        return [
            'bytes' => $this->drive->downloadFileContent($artifact->external_file_id),
            'filename' => $artifact->filename ?: 'C-001_v'.$instance->version.'.pdf',
            'version' => $instance->version,
        ];
    }

    public function approve(CaseFile $caseFile, CaseDocument $caseDocument, User $actor): CaseGeneratedDocument
    {
        return DB::transaction(function () use ($caseFile, $caseDocument, $actor) {
            $case = CaseFile::query()->whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $document = $case->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
            $this->assertC001($document);
            $instance = $document->generatedDocuments()->orderByDesc('version')->lockForUpdate()->firstOrFail();
            $workbook = $instance->artifacts()->where('artifact_type', self::ARTIFACT_TYPE)
                ->where('storage_provider', 'google_drive')->first();
            $pdf = $instance->artifacts()->where('artifact_type', self::PDF_ARTIFACT_TYPE)
                ->where('storage_provider', 'google_drive')->first();
            if ($instance->workflow_status !== 'review' || ! $workbook || ! $pdf
                || ! $workbook->uploaded_at || ! $pdf->uploaded_at
                || $workbook->uploaded_at->lt($instance->updated_at)
                || $pdf->uploaded_at->lt($instance->updated_at)) {
                throw ValidationException::withMessages(['workflow_status' => 'Driveに保存され、承認待ちのC-001のみ承認できます。']);
            }
            $instance->update([
                'workflow_status' => 'approved',
                'approved_data' => $instance->draft_data,
                'approved_at' => now(),
                'approved_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);
            $document->update([
                'collection_status' => 'received',
                'fulfillment_status' => 'satisfied',
                'review_status' => 'reviewed',
            ]);

            return $instance->fresh(['artifacts', 'approvedBy:id,name']);
        });
    }

    public function reject(CaseFile $caseFile, CaseDocument $caseDocument, User $actor): CaseGeneratedDocument
    {
        return DB::transaction(function () use ($caseFile, $caseDocument, $actor) {
            $case = CaseFile::query()->whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $document = $case->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
            $this->assertC001($document);
            $instance = $document->generatedDocuments()->orderByDesc('version')->lockForUpdate()->firstOrFail();
            if ($instance->workflow_status !== 'review') {
                throw ValidationException::withMessages(['workflow_status' => '承認待ちのC-001のみ差戻しできます。']);
            }
            $instance->update(['workflow_status' => 'draft', 'updated_by' => $actor->id]);
            $document->update(['review_status' => 'returned']);

            return $instance->fresh(['artifacts', 'approvedBy:id,name']);
        });
    }

    public function isC001(CaseDocument $document): bool
    {
        if ($document->relationLoaded('documentType') && $document->documentType?->code !== null) {
            return $document->documentType->code === 'C-001';
        }

        // The relation may already be loaded by a caller with only handling_type selected.
        // Query the relationship directly so a partially-loaded relation cannot hide C-001.
        return $document->documentType()->where('code', 'C-001')->exists();
    }

    public function officialWorkflowEnabled(CaseDocument $document): bool
    {
        if (! $this->isC001($document)) {
            return false;
        }

        return trim((string) config('services.google_drive.c001_template_folder_id')) !== ''
            || $document->generatedDocuments()->whereHas('artifacts', fn ($query) => $query
                ->where('artifact_type', self::ARTIFACT_TYPE)
                ->where('storage_provider', 'google_drive'))->exists();
    }

    public function normalizePercentage(mixed $value): string
    {
        if (! is_numeric($value)) {
            throw ValidationException::withMessages(['success_fee_percentage' => '報酬金は数値で入力してください。']);
        }
        $number = round((float) $value, 2);
        if ($number <= 0 || $number > 100) {
            throw ValidationException::withMessages(['success_fee_percentage' => '報酬金は0より大きく100以下で入力してください。']);
        }

        return rtrim(rtrim(number_format($number, 2, '.', ''), '0'), '.');
    }

    private function formatPercentage(mixed $value): string
    {
        return $value === null ? '' : rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.');
    }

    private function assertC001(CaseDocument $document): void
    {
        abort_unless($this->isC001($document), 404, 'この操作はC-001のみ対応しています。');
    }

    private function filename(CaseFile $caseFile, CaseGeneratedDocument $instance, string $clientName): string
    {
        $safeClient = Str::of($clientName)->replaceMatches('~[\\/:*?"<>|\x00-\x1F]+~u', '-')
            ->squish()->trim(' .-')->limit(60, '');

        return 'C-001_委任契約書_CASE-'.$caseFile->id.'_'.$safeClient.'_v'.$instance->version.'.xlsx';
    }

    private function pdfFilename(string $workbookFilename): string
    {
        return preg_replace('/\.xlsx$/i', '.pdf', $workbookFilename) ?: $workbookFilename.'.pdf';
    }
}
