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

    public function test_history_attachment_streams_resumable_upload_and_rejects_public_folders(): void
    {
        config([
            'services.google_drive.enabled' => true,
            'services.google_drive.write_enabled' => true,
            'services.google_drive.auth_mode' => 'oauth_user',
            'services.google_drive.local_root_folder_id' => 'synthetic_root',
            'services.google_drive.oauth_scope' => 'https://www.googleapis.com/auth/drive',
            'services.google_drive.oauth_client_json' => json_encode(['web' => ['client_id' => 'synthetic', 'client_secret' => 'synthetic']]),
            'services.google_drive.oauth_token_json' => json_encode([
                'access_token' => 'fake-token', 'refresh_token' => 'fake-refresh', 'expires_at' => now()->addHour()->timestamp,
            ]),
        ]);
        $url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic';
        $contents = 'synthetic video bytes';
        Http::fake(function ($request) use ($url, $contents) {
            if ($request->method() === 'PUT' && $request->url() === $url) {
                $this->assertSame($contents, $request->body());
                $this->assertSame([(string) strlen($contents)], $request->header('Content-Length'));

                return Http::response(['id' => 'synthetic_file']);
            }
            if (str_contains($request->url(), 'uploadType=resumable')) {
                $this->assertSame(['history_folder'], $request['parents']);
                $this->assertSame('synthetic_file', $request['id']);

                return Http::response([], 200, ['Location' => $url]);
            }
            if (str_contains($request->url(), '/files/generateIds')) {
                return Http::response(['ids' => ['synthetic_file']]);
            }
            if (str_contains($request->url(), '/files/public_folder/permissions')) {
                return Http::response(['permissions' => [['type' => 'anyone']]]);
            }
            if (str_contains($request->url(), '/files/history_folder/permissions')) {
                return Http::response(['permissions' => [['type' => 'user']]]);
            }
            if (preg_match('~/files/(history_folder|public_folder)\?~', $request->url())) {
                return Http::response(['mimeType' => 'application/vnd.google-apps.folder', 'capabilities' => ['canAddChildren' => true]]);
            }
            if (str_contains($request->url(), '/files/synthetic_file?')) {
                return Http::response($contents, 200);
            }

            $this->fail('Unexpected fake provider request.');
        });
        $drive = app(GoogleDriveService::class);
        $drive->assertHistoryAttachmentFolder('history_folder');
        $stream = fopen('php://temp', 'w+b');
        fwrite($stream, $contents);
        rewind($stream);
        try {
            $this->assertSame('synthetic_file', $drive->storeHistoryAttachment($stream, 'test.mp4', 'video/mp4', strlen($contents), 'history_folder'));
        } finally {
            if (is_resource($stream)) fclose($stream);
        }
        $download = $drive->historyAttachmentStream('synthetic_file');
        $this->assertSame($contents, $download->getContents());
        $download->close();

        $this->expectException(GeneratedDocumentDriveException::class);
        $drive->assertHistoryAttachmentFolder('public_folder');
    }

    public function test_c001_reuses_one_working_copy_and_never_updates_the_master_template(): void
    {
        $opensslConfig = tempnam(sys_get_temp_dir(), 'themis-openssl-');
        file_put_contents($opensslConfig, "[req]\ndistinguished_name = dn\n[dn]\n");
        try {
            $key = openssl_pkey_new(['config' => $opensslConfig, 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
            openssl_pkey_export($key, $privateKey, null, ['config' => $opensslConfig]);
        } finally {
            unlink($opensslConfig);
        }

        config([
            'services.google_drive.enabled' => true,
            'services.google_drive.write_enabled' => true,
            'services.google_drive.auth_mode' => 'service_account',
            'services.google_drive.generated_documents_folder_id' => 'root',
            'services.google_drive.write_scope' => 'https://www.googleapis.com/auth/drive',
            'services.google_drive.service_account_json' => json_encode([
                'client_email' => 'test@example.test',
                'private_key' => $privateKey,
                'token_uri' => 'https://oauth2.googleapis.com/token',
            ]),
        ]);

        $copyCreated = false;
        Http::fake(function ($request) use (&$copyCreated) {
            if (str_contains($request->url(), 'oauth2.googleapis.com')) {
                return Http::response(['access_token' => 'fake-token', 'expires_in' => 3600]);
            }
            if (str_contains($request->url(), '/files/master_template/copy')) {
                $copyCreated = true;

                return Http::response([
                    'id' => 'working_copy',
                    'name' => 'C-001.xlsx',
                    'mimeType' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'createdTime' => '2026-09-15T00:00:00Z',
                ]);
            }
            if (str_contains($request->url(), '/files/master_template')) {
                return Http::response([
                    'id' => 'master_template',
                    'name' => '委任契約書簡易版完全成功報酬-空欄.xlsx',
                    'mimeType' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'trashed' => false,
                    'parents' => ['template_folder'],
                ]);
            }
            if (str_contains($request->url(), '/files/root') || str_contains($request->url(), '/files/case_documents')) {
                return Http::response([
                    'id' => str_contains($request->url(), '/files/root') ? 'root' : 'case_documents',
                    'mimeType' => 'application/vnd.google-apps.folder',
                    'trashed' => false,
                    'capabilities' => ['canAddChildren' => true],
                ]);
            }
            if (str_contains($request->url(), '/upload/drive/v3/files/working_copy')) {
                $this->assertSame('PATCH', $request->method());
                $this->assertSame('updated-workbook', $request->body());

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/drive/v3/files')) {
                return Http::response(['incompleteSearch' => false, 'files' => $copyCreated ? [[
                    'id' => 'working_copy',
                    'name' => 'C-001.xlsx',
                    'mimeType' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'createdTime' => '2026-09-15T00:00:00Z',
                ]] : []]);
            }

            return Http::response([], 404);
        });

        $drive = app(GoogleDriveService::class);
        $resolved = $drive->resolveExactTemplateFile(
            'template_folder',
            '委任契約書簡易版完全成功報酬-空欄.xlsx',
            'master_template'
        );
        $first = $drive->ensureGeneratedWorkbookCopy($resolved['id'], 'case_documents', 'C-001.xlsx', str_repeat('b', 64));
        $again = $drive->ensureGeneratedWorkbookCopy($resolved['id'], 'case_documents', 'C-001.xlsx', str_repeat('b', 64));
        $drive->replaceWorkbookContent($first['id'], $resolved['id'], 'updated-workbook');

        $this->assertSame('working_copy', $first['id']);
        $this->assertSame($first, $again);
        $this->assertCount(1, Http::recorded(fn ($request) => str_contains($request->url(), '/files/master_template/copy')));
        $this->assertCount(0, Http::recorded(fn ($request) => str_contains($request->url(), '/upload/drive/v3/files/master_template')));
    }
}
