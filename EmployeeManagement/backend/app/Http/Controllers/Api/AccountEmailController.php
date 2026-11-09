<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Administration\AccountEmailChange;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AccountEmailController extends Controller
{
    public function __construct(private AccountEmailChange $change) {}

    public function status(Request $request): JsonResponse
    {
        return response()->json([
            'available' => $this->change->available(),
            'requires_mfa' => app(VerifiedMfaSessions::class)->required($request->user()),
            'delivery' => $this->change->usesLocalLog() ? 'local_log' : 'email',
        ])->header('Cache-Control', 'no-store, private');
    }

    public function issue(Request $request): JsonResponse
    {
        abort_if($request->query->count() > 0, 422);
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'current_password' => ['required', 'string', 'max:128'],
            'otp' => ['nullable', 'string', 'regex:/^[0-9]{6}$/D'],
            'user_id' => ['prohibited'], 'employee_id' => ['prohibited'], 'token_id' => ['prohibited'],
        ]);
        return response()->json($this->change->issue($request->user(), $data['email'], $data['current_password'], $data['otp'] ?? null))
            ->header('Cache-Control', 'no-store, private');
    }

    public function confirm(Request $request): JsonResponse
    {
        abort_if($request->query->count() > 0, 422);
        $data = $request->validate([
            'challenge_id' => ['required', 'uuid'], 'code' => ['required', 'string', 'regex:/^[0-9]{6}$/D'],
            'user_id' => ['prohibited'], 'employee_id' => ['prohibited'], 'token_id' => ['prohibited'], 'email' => ['prohibited'],
        ]);
        $this->change->confirm($request->user(), $data['challenge_id'], $data['code']);
        return response()->json(['reauthentication_required' => true, 'message' => 'メールアドレスを変更しました。新しいメールアドレスで再度ログインしてください。'])
            ->header('Cache-Control', 'no-store, private');
    }
}
