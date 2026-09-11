<?php

namespace Tests\Feature;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Services\GoogleDriveService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class GoogleDriveOAuthTest extends TestCase
{
    private string $clientFile;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Storage::fake('local');
        $this->clientFile = tempnam(sys_get_temp_dir(), 'themis-oauth-');
        file_put_contents($this->clientFile, json_encode([
            'web' => ['client_id' => 'test-client', 'client_secret' => 'test-secret'],
        ], JSON_THROW_ON_ERROR));
        config([
            'services.google_drive.enabled' => true,
            'services.google_drive.auth_mode' => 'oauth_user',
            'services.google_drive.oauth_client_json_path' => $this->clientFile,
            'services.google_drive.oauth_token_path' => 'google-drive/oauth-token.json',
            'services.google_drive.oauth_redirect_uri' => 'http://localhost:8000/google-drive/oauth/callback',
            'services.google_drive.oauth_scope' => 'https://www.googleapis.com/auth/drive',
        ]);
    }

    protected function tearDown(): void
    {
        if (is_file($this->clientFile)) {
            unlink($this->clientFile);
        }
        parent::tearDown();
    }

    public function test_successful_exchange_persists_refresh_token_without_exposing_it(): void
    {
        Http::fake(['https://oauth2.googleapis.com/token' => Http::response([
            'access_token' => 'access-value',
            'refresh_token' => 'refresh-value',
            'expires_in' => 3600,
            'token_type' => 'Bearer',
        ])]);

        app(GoogleDriveService::class)->completeOAuthAuthorization('single-use-code');

        Storage::disk('local')->assertExists('google-drive/oauth-token.json');
        $this->assertTrue(app(GoogleDriveService::class)->hasOAuthRefreshToken());
        Http::assertSentCount(1);
    }

    public function test_transient_connection_failure_is_retried_only_until_success(): void
    {
        Http::fakeSequence()
            ->pushFailedConnection('temporary transport failure')
            ->push([
                'access_token' => 'access-value',
                'refresh_token' => 'refresh-value',
                'expires_in' => 3600,
            ]);

        app(GoogleDriveService::class)->completeOAuthAuthorization('single-use-code');

        $this->assertTrue(app(GoogleDriveService::class)->hasOAuthRefreshToken());
        Http::assertSentCount(2);
    }

    public function test_expired_access_token_is_refreshed_before_drive_request(): void
    {
        config([
            'services.google_drive.write_enabled' => true,
            'services.google_drive.root_folder_id' => 'themis_root',
        ]);
        Storage::disk('local')->put('google-drive/oauth-token.json', json_encode([
            'access_token' => 'expired-access',
            'refresh_token' => 'refresh-value',
            'expires_at' => now()->subMinute()->timestamp,
        ], JSON_THROW_ON_ERROR));
        Http::fake(function ($request) {
            if ($request->url() === 'https://oauth2.googleapis.com/token') {
                $this->assertSame('refresh_token', $request['grant_type']);

                return Http::response(['access_token' => 'refreshed-access', 'expires_in' => 3600]);
            }
            $this->assertSame('Bearer refreshed-access', $request->header('Authorization')[0]);

            return Http::response([
                'id' => 'themis_root',
                'mimeType' => 'application/vnd.google-apps.folder',
                'trashed' => false,
                'capabilities' => ['canAddChildren' => true],
            ]);
        });

        $this->assertTrue(app(GoogleDriveService::class)->canWriteGeneratedDocuments());
        Http::assertSentCount(2);
    }

    public function test_invalid_grant_is_not_retried(): void
    {
        Http::fake(['https://oauth2.googleapis.com/token' => Http::response([
            'error' => 'invalid_grant',
        ], 400)]);

        $this->expectException(GeneratedDocumentDriveException::class);
        try {
            app(GoogleDriveService::class)->completeOAuthAuthorization('invalid-code');
        } finally {
            Http::assertSentCount(1);
        }
    }

    public function test_production_oauth_uses_environment_secrets_and_refreshes_without_local_files(): void
    {
        app()->detectEnvironment(fn () => 'production');
        config([
            'services.google_drive.write_enabled' => true,
            'services.google_drive.root_folder_id' => 'production_root',
            'services.google_drive.oauth_production_enabled' => true,
            'services.google_drive.oauth_client_json' => 'base64:'.base64_encode(json_encode([
                'web' => ['client_id' => 'production-client', 'client_secret' => 'production-secret'],
            ], JSON_THROW_ON_ERROR)),
            'services.google_drive.oauth_client_json_path' => null,
            'services.google_drive.oauth_token_json' => 'base64:'.base64_encode(json_encode([
                'refresh_token' => 'production-refresh',
            ], JSON_THROW_ON_ERROR)),
            'services.google_drive.oauth_token_path' => 'missing/token.json',
        ]);
        Http::fake(function ($request) {
            if ($request->url() === 'https://oauth2.googleapis.com/token') {
                $this->assertSame('production-refresh', $request['refresh_token']);

                return Http::response(['access_token' => 'production-access', 'expires_in' => 3600]);
            }

            $this->assertSame('Bearer production-access', $request->header('Authorization')[0]);

            return Http::response([
                'id' => 'production_root',
                'mimeType' => 'application/vnd.google-apps.folder',
                'trashed' => false,
                'capabilities' => ['canAddChildren' => true],
            ]);
        });

        $this->assertTrue(app(GoogleDriveService::class)->canWriteGeneratedDocuments());
        Storage::disk('local')->assertMissing('missing/token.json');
        Http::assertSentCount(2);
    }

    public function test_production_oauth_requires_explicit_opt_in(): void
    {
        app()->detectEnvironment(fn () => 'production');
        config([
            'services.google_drive.write_enabled' => true,
            'services.google_drive.root_folder_id' => 'production_root',
            'services.google_drive.oauth_production_enabled' => false,
            'services.google_drive.oauth_client_json' => '{}',
            'services.google_drive.oauth_token_json' => '{}',
        ]);

        $this->assertFalse(app(GoogleDriveService::class)->canWriteGeneratedDocuments());
        Http::assertNothingSent();
    }

    public function test_callback_returns_safe_message_after_transport_failure(): void
    {
        Http::fakeSequence()
            ->pushFailedConnection()
            ->pushFailedConnection()
            ->pushFailedConnection();

        $response = $this->withSession(['google_drive_oauth_state' => 'expected-state'])
            ->get('/google-drive/oauth/callback?state=expected-state&code=sensitive-code');

        $response->assertStatus(503)
            ->assertSeeText('Google OAuth token exchange failed. Please retry authorization.')
            ->assertDontSee('sensitive-code')
            ->assertDontSee('test-secret');
        Http::assertSentCount(3);
    }
}
