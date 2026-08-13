<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Đăng nhập.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => [
                'required',
                'email',
                'max:255',
            ],
            'password' => [
                'required',
                'string',
            ],
            'remember' => [
                'sometimes',
                'boolean',
            ],
        ]);

        $user = User::query()
            ->with([
                'employee.office',
                'employee.department',
            ])
            ->where('email', strtolower($validated['email']))
            ->where('is_active', true)
            ->first();

        if ($user === null || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => [
                    'メールアドレスまたはパスワードが正しくありません。',
                ],
            ]);
        }

        // Kiểm tra hồ sơ nhân viên còn hoạt động hay không.
        if (
            $user->employee === null ||
            $user->employee->status !== 'active'
        ) {
            return response()->json([
                'message' => 'この従業員アカウントは利用できません。',
            ], 403);
        }

        $user->forceFill([
            'last_login_at' => now(),
        ])->save();

        $expiresAt = ($validated['remember'] ?? false)
            ? now()->addDays(30)
            : now()->addHours(12);

        $token = $user
            ->createToken('employee-web', ['*'], $expiresAt)
            ->plainTextToken;

        return response()->json([
            'message' => 'ログインしました。',
            'user' => $user,
            'token' => $token,
        ]);
    }

    /**
     * Lấy thông tin người đang đăng nhập.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load([
            'employee.office',
            'employee.department',
        ]);

        return response()->json([
            'user' => $user,
        ]);
    }

    /**
     * Đăng xuất.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'ログアウトしました。',
        ]);
    }
}
