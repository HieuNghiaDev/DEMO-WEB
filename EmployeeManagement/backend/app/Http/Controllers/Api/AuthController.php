<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Đăng nhập.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'login_id' => [
                'required',
                'string',
                'max:50',
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

        $authenticated = Auth::attempt(
            [
                'login_id' => $validated['login_id'],
                'password' => $validated['password'],
                'is_active' => true,
            ],
            $validated['remember'] ?? false
        );

        if (! $authenticated) {
            throw ValidationException::withMessages([
                'login_id' => [
                    '社員コードまたはパスワードが正しくありません。',
                ],
            ]);
        }

        $request->session()->regenerate();

        $user = $request->user()->load([
            'employee.office',
            'employee.department',
        ]);

        // Kiểm tra hồ sơ nhân viên còn hoạt động hay không.
        if (
            $user->employee === null ||
            $user->employee->status !== 'active'
        ) {
            Auth::guard('web')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'この従業員アカウントは利用できません。',
            ], 403);
        }

        $user->forceFill([
            'last_login_at' => now(),
        ])->save();

        return response()->json([
            'message' => 'ログインしました。',
            'user' => $user,
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
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'ログアウトしました。',
        ]);
    }
}