<?php

namespace App\Services;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\GeneratedDocumentArtifact;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

class GeneratedDocumentStorageService
{
    public function __construct(
        private GoogleDriveService $drive,
        private GoogleDriveProvisioningService $folders,
        private DocumentPdfRenderer $pdf
    ) {}

    public function state(?CaseGeneratedDocument $instance, bool $canUpload): array
    {
        $artifact = $instance?->artifacts()->where('storage_provider', 'google_drive')->where('artifact_type', 'pdf')->first();

        return ['available' => $canUpload && $instance?->workflow_status === 'approved' && ! $artifact && $this->drive->canWriteGeneratedDocuments(),
            'artifact' => $artifact ? $this->artifactPayload($artifact) : null];
    }

    public function save(CaseFile $caseFile, CaseDocument $caseDocument, int $actorId, ?int $version = null): array
    {
        $remote = null;
        $instanceId = null;
        $key = null;
        try {
            return DB::transaction(function () use ($caseFile, $caseDocument, $actorId, $version, &$remote, &$instanceId, &$key) {
                // Match collection's lock order; serializes folder creation and upload across a case.
                CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
                $item = $caseFile->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
                $instanceQuery = $item->generatedDocuments()->with('template.documentType');
                if ($version !== null) {
                    $instanceQuery->where('version', $version);
                }
                $instance = $instanceQuery->orderByDesc('version')->lockForUpdate()->firstOrFail();
                $instanceId = $instance->id;
                if ($instance->workflow_status !== 'approved' || $instance->approved_data === null) {
                    throw ValidationException::withMessages(['workflow_status' => '承認済みの文書のみ保存できます。']);
                }
                $artifact = $instance->artifacts()->where('storage_provider', 'google_drive')->where('artifact_type', 'pdf')->first();
                if ($artifact) {
                    return ['available' => false, 'artifact' => $this->artifactPayload($artifact)];
                }
                if (! $this->drive->canWriteGeneratedDocuments()) {
                    throw new GeneratedDocumentDriveException('Google Driveへの保存は現在利用できません。');
                }
                $bytes = $this->pdf->render($instance);
                $filename = $this->pdf->filename($instance, $caseFile->id);
                $key = hash('sha256', config('app.key').'|'.$instance->id.'|'.$instance->approved_at?->toISOString());
                $folder = $this->folders->provisionGeneratedDocuments($caseFile);
                $remote = $this->drive->storeGeneratedPdf($bytes, $filename, $folder->external_folder_id, $key);
                // Store success only after provider confirmation (including reconciliation of a prior upload).
                $artifact = $instance->artifacts()->create($remote + [
                    'artifact_type' => 'pdf', 'storage_provider' => 'google_drive', 'uploaded_by' => $actorId,
                ]);

                return ['available' => false, 'artifact' => $this->artifactPayload($artifact)];
            });
        } catch (Throwable $error) {
            if ($remote !== null) {
                Log::error('Generated document Drive upload requires DB reconciliation.', [
                    'generated_document_id' => $instanceId, 'external_file_id' => $remote['external_file_id'], 'recovery_key' => $key,
                ]);
                throw new GeneratedDocumentDriveException('Driveへの保存後、記録の保存に失敗しました。管理者に確認してください。');
            }
            throw $error;
        }
    }

    private function artifactPayload(GeneratedDocumentArtifact $artifact): array
    {
        return [
            'external_file_id' => $artifact->external_file_id,
            'url' => $artifact->external_url,
            'filename' => $artifact->filename,
            'uploaded_at' => $artifact->uploaded_at?->toISOString(),
        ];
    }
}
