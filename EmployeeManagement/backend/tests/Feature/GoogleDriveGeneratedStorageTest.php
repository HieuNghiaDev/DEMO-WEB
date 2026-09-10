<?php

namespace Tests\Feature;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Services\GoogleDriveService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleDriveGeneratedStorageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
    }

    public function test_write_is_disabled_without_explicit_opt_in_and_readonly_scope_is_not_write(): void
    {
        config(['services.google_drive.write_enabled' => false]);
        $this->assertFalse(app(GoogleDriveService::class)->canWriteGeneratedDocuments());
        config(['services.google_drive.enabled' => true, 'services.google_drive.write_enabled' => true,
            'services.google_drive.auth_mode' => 'service_account',
            'services.google_drive.generated_documents_folder_id' => 'root', 'services.google_drive.service_account_json' => '{}',
            'services.google_drive.write_scope' => 'https://www.googleapis.com/auth/drive.readonly']);
        $this->assertFalse(app(GoogleDriveService::class)->canWriteGeneratedDocuments());
        Http::assertNothingSent();
    }

    public function test_existing_client_uploads_multipart_once_and_reconciles_by_tag_after_db_failure(): void
    {
        // Windows PHP may not have a default openssl.cnf. Keep test-only keys in memory.
        $opensslConfig = tempnam(sys_get_temp_dir(), 'themis-openssl-');
        file_put_contents($opensslConfig, "[req]\ndistinguished_name = dn\n[dn]\n");
        try {
            $key = openssl_pkey_new(['config' => $opensslConfig, 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
            openssl_pkey_export($key, $privateKey, null, ['config' => $opensslConfig]);
        } finally {
            unlink($opensslConfig);
        }
        config(['services.google_drive.enabled' => true, 'services.google_drive.write_enabled' => true,
            'services.google_drive.auth_mode' => 'service_account',
            'services.google_drive.generated_documents_folder_id' => 'root',
            'services.google_drive.write_scope' => 'https://www.googleapis.com/auth/drive.file',
            'services.google_drive.service_account_json' => json_encode(['client_email' => 'test@example.test', 'private_key' => $privateKey, 'token_uri' => 'https://oauth2.googleapis.com/token'])]);
        $uploaded = false;
        $scope = null;
        $file = ['id' => 'pdf_one', 'name' => '承認済み.pdf', 'mimeType' => 'application/pdf', 'createdTime' => '2026-09-06T00:00:00Z', 'appProperties' => ['sha256' => hash('sha256', '%PDF-snapshot')]];
        Http::fake(function ($request) use (&$uploaded, &$scope, $file) {
            if (str_contains($request->url(), 'oauth2.googleapis.com')) {
                $jwt = explode('.', $request['assertion']);
                $scope = json_decode(base64_decode(strtr($jwt[1], '-_', '+/')), true)['scope'];

                return Http::response(['access_token' => 'fake-token', 'expires_in' => 3600]);
            }
            if (str_contains($request->url(), '/files/root')) {
                return Http::response(['id' => 'root', 'mimeType' => 'application/vnd.google-apps.folder', 'driveId' => 'shared', 'capabilities' => ['canAddChildren' => true]]);
            }
            if (str_contains($request->url(), '/files/generated_folder')) {
                return Http::response(['id' => 'generated_folder', 'mimeType' => 'application/vnd.google-apps.folder', 'capabilities' => ['canAddChildren' => true]]);
            }
            if (str_contains($request->url(), '/upload/drive/')) {
                $this->assertFalse($uploaded);
                $this->assertStringContainsString('%PDF-snapshot', $request->body());
                $this->assertStringContainsString('themis_generated_document', $request->body());
                $this->assertStringContainsString('multipart/related', $request->header('Content-Type')[0]);
                $uploaded = true;

                return Http::response($file);
            }
            if (str_contains($request['q'], 'appProperties')) {
                return Http::response(['files' => $uploaded ? [$file] : []]);
            }

            return Http::response([], 404);
        });
        $drive = app(GoogleDriveService::class);
        $first = $drive->storeGeneratedPdf('%PDF-snapshot', '承認済み.pdf', 'generated_folder', str_repeat('a', 64));
        $again = $drive->storeGeneratedPdf('%PDF-snapshot', '承認済み.pdf', 'generated_folder', str_repeat('a', 64));
        $this->assertSame($first, $again);
        $this->assertSame('https://drive.google.com/file/d/pdf_one/view', $again['external_url']);
        $this->assertSame('https://www.googleapis.com/auth/drive.file', $scope);
        $this->assertCount(1, Http::recorded(fn ($request) => str_contains($request->url(), '/upload/drive/')));
        // A provider listing gap after successful upload must not create a second file.
        $uploaded = false;
        try {
            $drive->storeGeneratedPdf('%PDF-snapshot', '承認済み.pdf', 'generated_folder', str_repeat('a', 64));
            $this->fail('Uncertain prior upload must require reconciliation.');
        } catch (GeneratedDocumentDriveException) {
            $this->assertCount(1, Http::recorded(fn ($request) => str_contains($request->url(), '/upload/drive/')));
        }
    }

    public function test_provider_error_does_not_expose_signed_request_or_credentials(): void
    {
        config(['services.google_drive.enabled' => true, 'services.google_drive.write_enabled' => true,
            'services.google_drive.auth_mode' => 'service_account',
            'services.google_drive.generated_documents_folder_id' => 'root', 'services.google_drive.service_account_json' => 'invalid-secret']);
        $this->assertFalse(app(GoogleDriveService::class)->canWriteGeneratedDocuments());
        Http::assertNothingSent();
    }
}
