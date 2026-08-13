<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SecurityAuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAuditLogger
    ) {}

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

        $email = strtolower($validated['email']);

        $user = User::query()
            ->with([
                'employee.office',
                'employee.department',
            ])
            ->where('email', $email)
            ->first();

        $passwordIsValid = $user !== null &&
            Hash::check($validated['password'], $user->password);

        if (
            $user === null ||
            ! $user->is_active ||
            ! $passwordIsValid
        ) {
            $reason = match (true) {
                $user === null => 'unknown_account',
                ! $user->is_active => 'inactive_account',
                default => 'invalid_password',
            };

            $this->securityAuditLogger->record(
                request: $request,
                event: 'auth.login.failed',
                outcome: 'failure',
                user: $user,
                identifier: $email,
                metadata: [
                    'reason' => $reason,
                ]
            );

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
            $this->securityAuditLogger->record(
                request: $request,
                event: 'auth.login.denied',
                outcome: 'failure',
                user: $user,
                identifier: $email,
                metadata: [
                    'reason' => 'inactive_employee_profile',
                ]
            );

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

        $this->securityAuditLogger->record(
            request: $request,
            event: 'auth.login.succeeded',
            outcome: 'success',
            user: $user,
            metadata: [
                'remember' => $validated['remember'] ?? false,
                'expires_at' => $expiresAt->toIso8601String(),
            ]
        );

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
        $user = $request->user();

        $user->currentAccessToken()?->delete();

        $this->securityAuditLogger->record(
            request: $request,
            event: 'auth.logout.succeeded',
            outcome: 'success',
            user: $user
        );

        return response()->json([
            'message' => 'ログアウトしました。',
        ]);
    }
}
