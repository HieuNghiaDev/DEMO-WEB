<?php

namespace App\Services;

use App\Models\CaseFile;
use App\Models\Client;
use App\Models\ExternalStorageLocation;
use Illuminate\Database\UniqueConstraintViolationException;

class GoogleDriveProvisioningService
{
    private const PROVIDER = 'google_drive';

    public function __construct(private GoogleDriveService $drive) {}

    public function clientState(Client $client): array
    {
        return $this->state('client', $client->id, 'client_folder');
    }

    public function caseState(CaseFile $caseFile): array
    {
        return $this->state('case_file', $caseFile->id, 'case_folder');
    }

    public function provisionClient(Client $client): ExternalStorageLocation
    {
        $existing = $this->location('client', $client->id, 'client_folder');
        if ($existing) {
            return $existing;
        }

        $clientRoot = $this->clientRoot();
        $name = 'CL-'.$client->id.'_'.$this->safeName($client->name, 'Client');
        $folder = $this->drive->ensureFolder(
            $clientRoot->external_folder_id,
            $name,
            'client:'.$client->id
        );

        return $this->persist('client', $client->id, 'client_folder', $folder, $name);
    }

    public function provisionCase(CaseFile $caseFile): ExternalStorageLocation
    {
        $existing = $this->location('case_file', $caseFile->id, 'case_folder');
        if ($existing) {
            return $existing;
        }

        $caseFile->loadMissing('client');
        $clientFolder = $this->provisionClient($caseFile->client);
        $name = 'CASE-'.$caseFile->id.'_'.$this->safeName(
            $caseFile->title ?: $caseFile->case_type,
            'Case'
        );
        $folder = $this->drive->ensureFolder(
            $clientFolder->external_folder_id,
            $name,
            'case_file:'.$caseFile->id
        );

        return $this->persist('case_file', $caseFile->id, 'case_folder', $folder, $name);
    }

    public function provisionGeneratedDocuments(CaseFile $caseFile): ExternalStorageLocation
    {
        $existing = $this->location('case_file', $caseFile->id, 'generated_documents_folder');
        if ($existing) {
            return $existing;
        }

        $caseFolder = $this->provisionCase($caseFile);
        $folder = $this->drive->ensureFolder(
            $caseFolder->external_folder_id,
            '作成書類',
            'case_file:'.$caseFile->id.':generated_documents'
        );

        return $this->persist(
            'case_file',
            $caseFile->id,
            'generated_documents_folder',
            $folder,
            '作成書類'
        );
    }

    public function provisionCaseStructure(CaseFile $caseFile): ExternalStorageLocation
    {
        $caseFolder = $this->provisionCase($caseFile);
        $this->provisionGeneratedDocuments($caseFile);

        return $caseFolder;
    }

    private function clientRoot(): ExternalStorageLocation
    {
        $existing = $this->location('system', 0, 'client_root');
        if ($existing) {
            return $existing;
        }

        $rootId = $this->drive->configuredRootFolderId();
        $this->drive->assertWritableFolder($rootId);
        // This is the only legacy-name lookup. Its result is persisted and reused thereafter.
        $folder = $this->drive->ensureFolder($rootId, 'Client', 'system:client_root', true);

        return $this->persist('system', 0, 'client_root', $folder, 'Client');
    }

    private function location(string $entityType, int $entityId, string $locationType): ?ExternalStorageLocation
    {
        return ExternalStorageLocation::query()
            ->where('provider', self::PROVIDER)
            ->where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->where('location_type', $locationType)
            ->first();
    }

    /** @param array{id: string, url: string} $folder */
    private function persist(
        string $entityType,
        int $entityId,
        string $locationType,
        array $folder,
        string $displayName
    ): ExternalStorageLocation {
        try {
            return ExternalStorageLocation::query()->create([
                'provider' => self::PROVIDER,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'location_type' => $locationType,
                'external_folder_id' => $folder['id'],
                'external_url' => $folder['url'],
                'display_name' => $displayName,
            ]);
        } catch (UniqueConstraintViolationException) {
            return $this->location($entityType, $entityId, $locationType) ?? throw new \RuntimeException(
                'Google Drive folder mapping could not be reconciled.'
            );
        }
    }

    private function state(string $entityType, int $entityId, string $locationType): array
    {
        $location = $this->location($entityType, $entityId, $locationType);

        return [
            'status' => $location ? 'ready' : 'not_provisioned',
            'url' => $location?->external_url,
        ];
    }

    private function safeName(?string $value, string $fallback): string
    {
        $name = trim((string) $value);
        $name = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F]+/u', '-', $name) ?? '';
        $name = preg_replace('/\s+/u', ' ', $name) ?? '';
        $name = trim($name, ' .-');

        return mb_substr($name !== '' ? $name : $fallback, 0, 80);
    }
}
