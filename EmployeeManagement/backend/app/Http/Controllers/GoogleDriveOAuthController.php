<?php

namespace App\Http\Controllers;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Exceptions\VisaProgressConfigurationException;
use App\Exceptions\VisaProgressSourceException;
use App\Services\GoogleDriveService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class GoogleDriveOAuthController extends Controller
{
    public function authorize(Request $request, GoogleDriveService $drive): RedirectResponse
    {
        $this->assertLocalOAuth($drive);
        $state = Str::random(64);
        $request->session()->put('google_drive_oauth_state', $state);

        return redirect()->away($drive->oauthAuthorizationUrl($state));
    }

    public function callback(Request $request, GoogleDriveService $drive): Response
    {
        $this->assertLocalOAuth($drive);
        $expectedState = (string) $request->session()->pull('google_drive_oauth_state', '');
        $state = (string) $request->query('state', '');
        abort_unless($expectedState !== '' && hash_equals($expectedState, $state), 419, 'OAuth state is invalid.');
        abort_if($request->filled('error'), 400, 'Google Drive authorization was not completed.');

        $code = (string) $request->query('code', '');
        abort_if($code === '', 400, 'Google Drive authorization code is missing.');
        try {
            $drive->completeOAuthAuthorization($code);
        } catch (ConnectionException|GeneratedDocumentDriveException|VisaProgressConfigurationException|VisaProgressSourceException) {
            return response(
                'Google OAuth token exchange failed. Please retry authorization.',
                503
            );
        }

        return response('Google Drive authorization completed. You may close this tab.');
    }

    private function assertLocalOAuth(GoogleDriveService $drive): void
    {
        abort_unless(app()->environment(['local', 'testing']) && $drive->authMode() === 'oauth_user', 404);
    }
}
