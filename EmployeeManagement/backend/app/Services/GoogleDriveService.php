<?php

namespace App\Services;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Exceptions\VisaProgressConfigurationException;
use App\Exceptions\VisaProgressSourceException;
use App\Exceptions\VisaProgressWorkbookNotFoundException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class GoogleDriveService
{
    private const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

    public function authMode(): string
    {
        return strtolower(trim((string) config('services.google_drive.auth_mode', 'service_account')));
    }

    public function configuredRootFolderId(): string
    {
        $folderId = trim((string) config('services.google_drive.root_folder_id'));
        if (! preg_match('/^[A-Za-z0-9_-]+$/', $folderId)) {
            throw new GeneratedDocumentDriveException('Google Driveのルート保存先が設定されていません。');
        }

        return $folderId;
    }

    public function oauthAuthorizationUrl(string $state): string
    {
        $credentials = $this->oauthClientCredentials();

        return 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
            'client_id' => $credentials['client_id'],
            'redirect_uri' => $this->oauthRedirectUri(),
            'response_type' => 'code',
            'scope' => (string) config('services.google_drive.oauth_scope'),
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function completeOAuthAuthorization(string $code): void
    {
        $credentials = $this->oauthClientCredentials();
        $response = $this->oauthTokenRequest($credentials['token_uri'], [
            'client_id' => $credentials['client_id'],
            'client_secret' => $credentials['client_secret'],
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => $this->oauthRedirectUri(),
        ]);

        if (! $response->successful() || ! is_string($response->json('access_token'))) {
            throw new GeneratedDocumentDriveException('Google Driveの認証を完了できませんでした。');
        }

        $existing = $this->oauthTokenData(false);
        $refreshToken = $response->json('refresh_token') ?? ($existing['refresh_token'] ?? null);
        if (! is_string($refreshToken) || $refreshToken === '') {
            throw new GeneratedDocumentDriveException('Google Driveの更新トークンを取得できませんでした。');
        }

        $this->storeOAuthToken([
            'access_token' => $response->json('access_token'),
            'refresh_token' => $refreshToken,
            'expires_at' => now()->addSeconds(max(60, (int) $response->json('expires_in', 3600)))->timestamp,
            'token_type' => is_string($response->json('token_type')) ? $response->json('token_type') : 'Bearer',
            'scope' => is_string($response->json('scope')) ? $response->json('scope') : null,
        ]);
    }

    public function hasOAuthRefreshToken(): bool
    {
        $data = $this->oauthTokenData(false);

        return is_array($data) && is_string($data['refresh_token'] ?? null) && $data['refresh_token'] !== '';
    }

    public function canWriteGeneratedDocuments(): bool
    {
        if (! $this->writeConfigured()) {
            return false;
        }
        try {
            $rootId = $this->authMode() === 'oauth_user'
                ? $this->configuredRootFolderId()
                : (string) config('services.google_drive.generated_documents_folder_id');
            $root = $this->writeRequest()->get($this->fileUrl($rootId), [
                'fields' => 'id,mimeType,trashed,capabilities(canAddChildren)', 'supportsAllDrives' => 'true',
            ]);

            return $root->successful() && $root->json('mimeType') === 'application/vnd.google-apps.folder'
                && $root->json('trashed') !== true && $root->json('capabilities.canAddChildren') === true;
        } catch (Throwable) {
            return false;
        }
    }

    /** Upload/find only files tagged for this instance. Never replace an existing Drive file. */
    public function storeGeneratedPdf(string $bytes, string $filename, string $folderId, string $key): array
    {
        try {
            if (! preg_match('/^[a-f0-9]{64}$/', $key)) {
                throw new GeneratedDocumentDriveException('保存識別子が不正です。');
            }
            if (! $this->canWriteGeneratedDocuments()) {
                throw new GeneratedDocumentDriveException('Google Driveへの保存は現在利用できません。');
            }
            $this->assertWritableFolder($folderId);
            $existing = $this->findGeneratedFile($folderId, $key);
            if ($existing) {
                return $this->uploadMetadata($existing);
            }
            $attemptKey = 'generated_document_drive.attempt.'.$key;
            if (Cache::has($attemptKey)) {
                throw new GeneratedDocumentDriveException('前回の保存結果を確認できません。管理者に確認してください。');
            }
            $boundary = 'themis_'.bin2hex(random_bytes(16));
            $metadata = json_encode([
                'name' => $filename, 'parents' => [$folderId], 'mimeType' => 'application/pdf',
                'appProperties' => ['themis_generated_document' => $key, 'sha256' => hash('sha256', $bytes)],
            ], JSON_THROW_ON_ERROR);
            $body = "--{$boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{$metadata}\r\n"
                ."--{$boundary}\r\nContent-Type: application/pdf\r\n\r\n{$bytes}\r\n--{$boundary}--\r\n";
            // No automatic retry of file creation: an uncertain response must be reconciled by tag first.
            // Keep the marker even after success: a lost DB commit must not re-create an unlisted file.
            Cache::forever($attemptKey, true);
            $response = $this->writeRequest()->timeout(45)->withBody($body, 'multipart/related; boundary='.$boundary)
                ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,createdTime,appProperties');
            if (! $response->successful()) {
                if (in_array($response->status(), [400, 401, 403, 404], true)) {
                    Cache::forget($attemptKey); // Explicitly rejected, not an ambiguous provider result.
                }
                throw new GeneratedDocumentDriveException('Google Driveへの保存に失敗しました。');
            }

            return $this->uploadMetadata($response->json());
        } catch (GeneratedDocumentDriveException $error) {
            throw $error;
        } catch (Throwable) {
            // Never propagate provider bodies, signed JWTs or request headers into logs/UI.
            throw new GeneratedDocumentDriveException('Google Driveへの保存に失敗しました。');
        }
    }

    private function writeConfigured(): bool
    {
        if (! (bool) config('services.google_drive.enabled') || ! (bool) config('services.google_drive.write_enabled')) {
            return false;
        }
        if ($this->authMode() === 'oauth_user') {
            return app()->environment(['local', 'testing'])
                && preg_match('/^[A-Za-z0-9_-]+$/', (string) config('services.google_drive.root_folder_id'))
                && is_file((string) config('services.google_drive.oauth_client_json_path'))
                && $this->hasOAuthRefreshToken()
                && config('services.google_drive.oauth_scope') === 'https://www.googleapis.com/auth/drive';
        }

        return $this->authMode() === 'service_account'
            && preg_match('/^[A-Za-z0-9_-]+$/', (string) config('services.google_drive.generated_documents_folder_id'))
            && trim((string) config('services.google_drive.service_account_json')) !== ''
            && in_array(config('services.google_drive.write_scope'), ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'], true);
    }

    private function writeRequest(): PendingRequest
    {
        return $this->authenticatedRequest((string) config('services.google_drive.write_scope'))->connectTimeout(5)->timeout(10);
    }

    public function assertWritableFolder(string $folderId): void
    {
        if (! preg_match('/^[A-Za-z0-9_-]+$/', $folderId)) {
            throw new GeneratedDocumentDriveException('Google Driveの保存先が不正です。');
        }
        $response = $this->writeRequest()->get($this->fileUrl($folderId), [
            'fields' => 'id,mimeType,trashed,capabilities(canAddChildren)',
            'supportsAllDrives' => 'true',
        ]);
        if (! $response->successful()
            || $response->json('mimeType') !== 'application/vnd.google-apps.folder'
            || $response->json('trashed') === true
            || $response->json('capabilities.canAddChildren') !== true) {
            throw new GeneratedDocumentDriveException('Google Driveの保存先を使用できません。');
        }
    }

    /** @return array{id: string, url: string} */
    public function ensureFolder(string $parent, string $name, string $identity, bool $allowNameFallback = false): array
    {
        $identityHash = hash('sha256', config('app.key').'|'.$identity);
        $escapedParent = $this->escapeQueryLiteral($parent);
        $escapedName = $this->escapeQueryLiteral($name);
        $escapedIdentity = $this->escapeQueryLiteral($identityHash);
        $identityClause = "appProperties has { key='themis_location' and value='{$escapedIdentity}' }";
        $nameClause = "name = '{$escapedName}'";
        $response = $this->writeRequest()->get('https://www.googleapis.com/drive/v3/files', [
            'q' => "'{$escapedParent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and ".($allowNameFallback ? "({$identityClause} or {$nameClause})" : $identityClause),
            'fields' => 'files(id)', 'pageSize' => 2, 'supportsAllDrives' => 'true', 'includeItemsFromAllDrives' => 'true',
        ]);
        if (! $response->successful() || ! is_array($response->json('files'))) {
            throw new GeneratedDocumentDriveException('保存先を確認できませんでした。');
        }
        $files = $response->json('files');
        if (count($files) > 1) {
            throw new GeneratedDocumentDriveException('保存先の確認が必要です。');
        }
        if ($files !== []) {
            return $this->folderMetadata($files[0]['id'] ?? null);
        }
        $created = $this->writeRequest()->post('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', [
            'name' => $name,
            'mimeType' => 'application/vnd.google-apps.folder',
            'parents' => [$parent],
            'appProperties' => ['themis_location' => $identityHash],
        ]);
        if (! $created->successful()) {
            throw new GeneratedDocumentDriveException('保存先を作成できませんでした。');
        }

        return $this->folderMetadata($created->json('id'));
    }

    private function findGeneratedFile(string $folder, string $key): ?array
    {
        // key is a server-generated SHA-256, never user input.
        $response = $this->writeRequest()->get('https://www.googleapis.com/drive/v3/files', [
            'q' => "'{$folder}' in parents and trashed = false and appProperties has { key='themis_generated_document' and value='{$key}' }",
            'fields' => 'incompleteSearch,files(id,name,mimeType,createdTime,appProperties)', 'pageSize' => 2,
            'supportsAllDrives' => 'true', 'includeItemsFromAllDrives' => 'true',
        ]);
        if (! $response->successful() || $response->json('incompleteSearch') === true || ! is_array($response->json('files')) || count($response->json('files')) > 1) {
            throw new GeneratedDocumentDriveException('保存済み文書を確認できませんでした。');
        }

        return $response->json('files.0');
    }

    private function uploadMetadata(mixed $data): array
    {
        $id = $this->validFileId($data['id'] ?? null);
        if (($data['mimeType'] ?? null) !== 'application/pdf' || ! is_string($data['name'] ?? null)) {
            throw new GeneratedDocumentDriveException('保存結果を確認できませんでした。');
        }

        return ['external_file_id' => $id, 'external_url' => 'https://drive.google.com/file/d/'.$id.'/view',
            'filename' => $data['name'], 'mime_type' => 'application/pdf',
            'checksum' => $data['appProperties']['sha256'] ?? null, 'uploaded_at' => $data['createdTime'] ?? now()->toISOString()];
    }

    private function validFileId(mixed $id): string
    {
        if (! is_string($id) || ! preg_match('/^[A-Za-z0-9_-]+$/', $id)) {
            throw new GeneratedDocumentDriveException('Google Driveの保存結果が不正です。');
        }

        return $id;
    }

    /** @return array{id: string, url: string} */
    private function folderMetadata(mixed $id): array
    {
        $folderId = $this->validFileId($id);

        return [
            'id' => $folderId,
            'url' => 'https://drive.google.com/drive/folders/'.$folderId,
        ];
    }

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
        if (! (bool) config('services.google_drive.enabled') || trim((string) config('services.google_drive.file_id')) === '') {
            return false;
        }

        return $this->authMode() === 'oauth_user'
            ? app()->environment(['local', 'testing']) && $this->hasOAuthRefreshToken()
            : $this->authMode() === 'service_account'
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

    private function authenticatedRequest(string $scope = self::DRIVE_SCOPE): PendingRequest
    {
        return Http::acceptJson()->withToken($this->accessToken($scope));
    }

    private function accessToken(string $scope): string
    {
        if ($this->authMode() === 'oauth_user') {
            return $this->oauthAccessToken();
        }
        if ($this->authMode() !== 'service_account') {
            throw new VisaProgressConfigurationException('Google Drive authentication mode is invalid.');
        }

        return $this->serviceAccountAccessToken($scope);
    }

    private function serviceAccountAccessToken(string $scope): string
    {
        $cacheKey = 'google_drive.token.'.hash('sha256', $scope.'|'.config('services.google_drive.service_account_json'));
        $cachedToken = Cache::get($cacheKey);

        if (is_string($cachedToken) && $cachedToken !== '') {
            return $cachedToken;
        }

        $credentials = $this->credentials();
        $issuedAt = now()->timestamp;
        $assertion = $this->createAssertion($credentials, $issuedAt, $scope);
        $response = Http::asForm()->acceptJson()->connectTimeout(5)->timeout(10)->post($credentials['token_uri'], [
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

    private function oauthAccessToken(): string
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new VisaProgressConfigurationException('OAuth user Drive access is local-only.');
        }
        $data = $this->oauthTokenData();
        $accessToken = $data['access_token'] ?? null;
        if (is_string($accessToken) && $accessToken !== '' && (int) ($data['expires_at'] ?? 0) > now()->addMinute()->timestamp) {
            return $accessToken;
        }

        $refreshToken = $data['refresh_token'] ?? null;
        if (! is_string($refreshToken) || $refreshToken === '') {
            throw new VisaProgressConfigurationException('Google Drive OAuth authorization is required.');
        }
        $credentials = $this->oauthClientCredentials();
        $response = $this->oauthTokenRequest($credentials['token_uri'], [
            'client_id' => $credentials['client_id'],
            'client_secret' => $credentials['client_secret'],
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token',
        ]);
        if (! $response->successful() || ! is_string($response->json('access_token'))) {
            throw new VisaProgressSourceException('Google Drive OAuth token refresh failed.');
        }

        $data['access_token'] = $response->json('access_token');
        $data['expires_at'] = now()->addSeconds(max(60, (int) $response->json('expires_in', 3600)))->timestamp;
        $data['token_type'] = is_string($response->json('token_type')) ? $response->json('token_type') : ($data['token_type'] ?? 'Bearer');
        $data['scope'] = is_string($response->json('scope')) ? $response->json('scope') : ($data['scope'] ?? null);
        $this->storeOAuthToken($data);

        return $data['access_token'];
    }

    /** @return array{client_id: string, client_secret: string, token_uri: string} */
    private function oauthClientCredentials(): array
    {
        $path = trim((string) config('services.google_drive.oauth_client_json_path'));
        if ($path === '' || ! is_file($path) || ! is_readable($path)) {
            throw new VisaProgressConfigurationException('Google Drive OAuth client is not configured.');
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        $web = is_array($decoded) && is_array($decoded['web'] ?? null) ? $decoded['web'] : null;
        if (! is_array($web)
            || ! is_string($web['client_id'] ?? null)
            || ! is_string($web['client_secret'] ?? null)) {
            throw new VisaProgressConfigurationException('Google Drive OAuth client is invalid.');
        }

        return [
            'client_id' => $web['client_id'],
            'client_secret' => $web['client_secret'],
            'token_uri' => 'https://oauth2.googleapis.com/token',
        ];
    }

    private function oauthRedirectUri(): string
    {
        $uri = trim((string) config('services.google_drive.oauth_redirect_uri'));
        if ($uri !== 'http://localhost:8000/google-drive/oauth/callback') {
            throw new VisaProgressConfigurationException('Google Drive OAuth redirect URI is invalid.');
        }

        return $uri;
    }

    private function oauthTokenRequest(string $tokenUri, array $form): Response
    {
        return Http::asForm()
            ->acceptJson()
            ->connectTimeout(5)
            ->timeout(15)
            ->retry(
                3,
                250,
                fn (Throwable $error): bool => $error instanceof ConnectionException,
                false
            )
            ->post($tokenUri, $form);
    }

    private function oauthTokenData(bool $throwWhenMissing = true): ?array
    {
        $path = trim((string) config('services.google_drive.oauth_token_path', 'google-drive/oauth-token.json'));
        $contents = Storage::disk('local')->get($path);
        if (! is_string($contents) || $contents === '') {
            if ($throwWhenMissing) {
                throw new VisaProgressConfigurationException('Google Drive OAuth authorization is required.');
            }

            return null;
        }
        $data = json_decode($contents, true);
        if (! is_array($data)) {
            if ($throwWhenMissing) {
                throw new VisaProgressConfigurationException('Google Drive OAuth token storage is invalid.');
            }

            return null;
        }

        return $data;
    }

    private function storeOAuthToken(array $data): void
    {
        $path = trim((string) config('services.google_drive.oauth_token_path', 'google-drive/oauth-token.json'));
        if (! Storage::disk('local')->put($path, json_encode($data, JSON_THROW_ON_ERROR))) {
            throw new GeneratedDocumentDriveException('Google Driveの認証情報を保存できませんでした。');
        }
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
    private function createAssertion(array $credentials, int $issuedAt, string $scope): string
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
            'scope' => $scope,
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

    private function escapeQueryLiteral(string $value): string
    {
        return str_replace(['\\', "'"], ['\\\\', "\\'"], $value);
    }
}
