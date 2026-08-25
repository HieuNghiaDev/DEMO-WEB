<?php

namespace App\Services;

use App\Exceptions\VisaProgressConfigurationException;
use App\Exceptions\VisaProgressSourceException;
use App\Exceptions\VisaProgressWorkbookNotFoundException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class GoogleDriveService
{
    private const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

    /**
     * Downloads the configured workbook to Laravel's local temporary storage.
     * The caller must invoke deleteDownload() once parsing is complete.
     *
     * @return array{path: string, temporary_path: string, metadata: array{id: string, name: string, mime_type: string|null, modified_at: string|null}}
     */
    public function downloadConfiguredWorkbook(): array
    {
        $fileId = trim((string) config('services.google_drive.file_id'));

        if (! $this->isConfigured() || $fileId === '') {
            throw new VisaProgressConfigurationException('Google Drive is not configured.');
        }

        $metadata = $this->getFileMetadata($fileId);
        $contents = $this->downloadFile($fileId);
        $extension = $this->extensionFor($metadata['name']);
        $temporaryPath = 'visa-progress/'.Str::uuid().'.'.$extension;

        Storage::disk('local')->put($temporaryPath, $contents);

        return [
            'path' => Storage::disk('local')->path($temporaryPath),
            'temporary_path' => $temporaryPath,
            'metadata' => $metadata,
        ];
    }

    /** @param array{temporary_path: string} $download */
    public function deleteDownload(array $download): void
    {
        Storage::disk('local')->delete($download['temporary_path']);
    }

    public function isConfigured(): bool
    {
        return (bool) config('services.google_drive.enabled')
            && trim((string) config('services.google_drive.file_id')) !== ''
            && trim((string) config('services.google_drive.service_account_json')) !== '';
    }

    /** @return array{id: string, name: string, mime_type: string|null, modified_at: string|null} */
    private function getFileMetadata(string $fileId): array
    {
        $response = $this->authenticatedRequest()
            ->get($this->fileUrl($fileId), [
                'fields' => 'id,name,mimeType,modifiedTime',
            ]);

        if ($response->status() === 404) {
            throw new VisaProgressWorkbookNotFoundException('Workbook was not found.');
        }

        if (! $response->successful()) {
            throw new VisaProgressSourceException('Workbook metadata could not be retrieved.');
        }

        $data = $response->json();

        if (! is_array($data) || ! is_string($data['id'] ?? null) || ! is_string($data['name'] ?? null)) {
            throw new VisaProgressSourceException('Workbook metadata is invalid.');
        }

        return [
            'id' => $data['id'],
            'name' => $data['name'],
            'mime_type' => is_string($data['mimeType'] ?? null) ? $data['mimeType'] : null,
            'modified_at' => is_string($data['modifiedTime'] ?? null) ? $data['modifiedTime'] : null,
        ];
    }

    private function downloadFile(string $fileId): string
    {
        $response = $this->authenticatedRequest()->get($this->fileUrl($fileId), [
            'alt' => 'media',
        ]);

        if ($response->status() === 404) {
            throw new VisaProgressWorkbookNotFoundException('Workbook was not found.');
        }

        if (! $response->successful()) {
            throw new VisaProgressSourceException('Workbook download failed.');
        }

        return $response->body();
    }

    private function authenticatedRequest(): PendingRequest
    {
        return Http::acceptJson()->withToken($this->accessToken());
    }

    private function accessToken(): string
    {
        $cacheKey = 'visa_progress.google_drive_access_token';
        $cachedToken = Cache::get($cacheKey);

        if (is_string($cachedToken) && $cachedToken !== '') {
            return $cachedToken;
        }

        $credentials = $this->credentials();
        $issuedAt = now()->timestamp;
        $assertion = $this->createAssertion($credentials, $issuedAt);
        $response = Http::asForm()->acceptJson()->post($credentials['token_uri'], [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ]);

        if (! $response->successful() || ! is_string($response->json('access_token'))) {
            throw new VisaProgressSourceException('Google Drive authentication failed.');
        }

        $token = $response->json('access_token');
        $expiresIn = max(60, (int) $response->json('expires_in', 3600));
        Cache::put($cacheKey, $token, now()->addSeconds(max(60, $expiresIn - 60)));

        return $token;
    }

    /** @return array{client_email: string, private_key: string, token_uri: string} */
    private function credentials(): array
    {
        $rawJson = trim((string) config('services.google_drive.service_account_json'));

        if (str_starts_with($rawJson, 'base64:')) {
            $decoded = base64_decode(substr($rawJson, 7), true);
            $rawJson = $decoded === false ? '' : $decoded;
        }

        $credentials = json_decode($rawJson, true);

        if (! is_array($credentials)
            || ! is_string($credentials['client_email'] ?? null)
            || ! is_string($credentials['private_key'] ?? null)
            || ! is_string($credentials['token_uri'] ?? null)) {
            throw new VisaProgressConfigurationException('Google Drive service account credentials are invalid.');
        }

        return [
            'client_email' => $credentials['client_email'],
            'private_key' => str_replace('\\n', "\n", $credentials['private_key']),
            'token_uri' => $credentials['token_uri'],
        ];
    }

    /** @param array{client_email: string, private_key: string, token_uri: string} $credentials */
    private function createAssertion(array $credentials, int $issuedAt): string
    {
        if (! function_exists('openssl_sign')) {
            throw new VisaProgressConfigurationException('OpenSSL is required for Google Drive authentication.');
        }

        $header = $this->base64UrlEncode(json_encode([
            'alg' => 'RS256',
            'typ' => 'JWT',
        ], JSON_THROW_ON_ERROR));
        $payload = $this->base64UrlEncode(json_encode([
            'iss' => $credentials['client_email'],
            'scope' => self::DRIVE_SCOPE,
            'aud' => $credentials['token_uri'],
            'iat' => $issuedAt,
            'exp' => $issuedAt + 3600,
        ], JSON_THROW_ON_ERROR));
        $unsignedToken = $header.'.'.$payload;

        try {
            $signed = openssl_sign($unsignedToken, $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256);
        } catch (Throwable) {
            $signed = false;
        }

        if ($signed !== true) {
            throw new VisaProgressConfigurationException('Google Drive service account credentials could not sign a token.');
        }

        return $unsignedToken.'.'.$this->base64UrlEncode($signature);
    }

    private function fileUrl(string $fileId): string
    {
        return 'https://www.googleapis.com/drive/v3/files/'.rawurlencode($fileId);
    }

    private function extensionFor(string $name): string
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return in_array($extension, ['xlsx', 'xls', 'ods'], true) ? $extension : 'xlsx';
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
