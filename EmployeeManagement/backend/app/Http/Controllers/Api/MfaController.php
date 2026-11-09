<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Administration\MfaAuthenticationService;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MfaController extends Controller
{
    public function __construct(private readonly MfaAuthenticationService $mfa) {}

    private function validateInput(Request $request, array $rules): array
    {
        // Secrets are never accepted from a URL, even if a POST body is also present.
        abort_if($request->query->count() > 0, 422, 'POST body is required.');
        if (in_array($request->path(), ['api/mfa/enrollment/start', 'api/mfa/enrollment/confirm', 'api/mfa/login'], true)) {
            // A password-bound pre-auth challenge is not completed in another account's session.
            abort_if($request->bearerToken() !== null || $request->user() !== null, 403, 'Use a clean pre-authentication request.');
        }
        return $request->validate([...$rules, 'user_id' => ['prohibited'], 'is_admin' => ['prohibited'], 'mfa_verified' => ['prohibited']]);
    }

    public function start(Request $request): JsonResponse
    {
        $data = $this->validateInput($request, ['challenge' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D']]);
        return response()->json($this->mfa->startEnrollment($data['challenge']))->header('Cache-Control', 'no-store, private');
    }

    public function confirm(Request $request): JsonResponse
    {
        $data = $this->validateInput($request, ['challenge' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'], 'otp' => ['required', 'string', 'regex:/^[0-9]{6}$/D']]);
        return response()->json($this->mfa->confirmEnrollment($data['challenge'], $data['otp']))->header('Cache-Control', 'no-store, private');
    }

    public function login(Request $request): JsonResponse
    {
        $data = $this->validateInput($request, ['challenge' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'],
            'otp' => ['nullable', 'required_without:recovery_code', 'prohibits:recovery_code', 'string', 'regex:/^[0-9]{6}$/D'],
            'recovery_code' => ['nullable', 'required_without:otp', 'prohibits:otp', 'string', 'regex:/^[a-f0-9]{32}$/D']]);
        return response()->json($this->mfa->verifyLogin($data['challenge'], $data['otp'] ?? null, $data['recovery_code'] ?? null))->header('Cache-Control', 'no-store, private');
    }

    public function stepUp(Request $request): JsonResponse
    {
        $data = $this->validateInput($request, ['password' => ['required', 'string'], 'otp' => ['required', 'string', 'regex:/^[0-9]{6}$/D'],
            'action' => ['required', 'string', 'max:64'], 'scope' => ['sometimes', 'array', 'max:5']]);
        return response()->json($this->mfa->stepUp($request->user(), $data['password'], $data['otp'], $data['action'], $data['scope'] ?? []))->header('Cache-Control', 'no-store, private');
    }

    public function regenerate(Request $request): JsonResponse
    {
        return response()->json($this->mfa->regenerateCodes($request->user()))->header('Cache-Control', 'no-store, private');
    }

    public function changeDevice(Request $request): JsonResponse
    {
        return response()->json($this->mfa->startDeviceChange($request->user()))->header('Cache-Control', 'no-store, private');
    }

    public function settings(Request $request, VerifiedMfaSessions $sessions): JsonResponse
    {
        return response()->json([
            'enabled' => $sessions->enrolled($request->user()),
            'required' => $sessions->policyRequiresMfa($request->user()),
        ])->header('Cache-Control', 'no-store, private');
    }

    public function optIn(Request $request): JsonResponse
    {
        $data = $this->validateInput($request, ['password' => ['required', 'string']]);

        return response()->json($this->mfa->beginOptionalEnrollment($request->user(), $data['password']))
            ->header('Cache-Control', 'no-store, private');
    }

    public function disable(Request $request): JsonResponse
    {
        $this->validateInput($request, []);

        return response()->json($this->mfa->disableOptionalMfa($request->user()))->header('Cache-Control', 'no-store, private');
    }
}
