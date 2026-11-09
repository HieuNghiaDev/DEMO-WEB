<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Administration\AccountActivationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;

class AccountActivationController extends Controller
{
    public function complete(Request $request, AccountActivationService $activation): JsonResponse
    {
        if ($request->query->has('token') || $request->query->has('password') || $request->query->has('password_confirmation')) {
            throw \Illuminate\Validation\ValidationException::withMessages(['token' => '招待情報はPOST本文で送信してください。']);
        }
        $data = $request->validate([
            'token' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'],
            'password' => ['required', 'string', 'max:128', 'confirmed', Password::min(11)->symbols(), 'regex:/[A-Z]/'],
            'user_id' => ['prohibited'], 'email' => ['prohibited'], 'role' => ['prohibited'],
            'is_active' => ['prohibited'], 'employee_id' => ['prohibited'],
        ]);
        $activation->complete($data['token'], $data['password']);
        return response()->json(['message' => 'アカウントを有効化しました。設定したパスワードでログインしてください。']);
    }
}
