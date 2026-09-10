<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SecurityAuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;
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
                'roles.permissions',
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
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }

    /**
     * Lấy thông tin người đang đăng nhập.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load([
            'employee.office',
            'employee.department',
            'roles.permissions',
        ]);

        return response()->json([
            'user' => $user,
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }

    /**
     * Replace a temporary password and revoke every existing session.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => [
                'required',
                'string',
                'confirmed',
                Password::min(11)->symbols(),
                'regex:/[A-Z]/',
            ],
        ], [
            'password.regex' => '新しいパスワードには英大文字を1文字以上含めてください。',
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['現在のパスワードが正しくありません。'],
            ]);
        }

        if (Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['新しいパスワードは現在のパスワードと異なるものを指定してください。'],
            ]);
        }

        $user->forceFill([
            'password' => Hash::make($validated['password']),
            'must_change_password' => false,
        ])->save();

        // A temporary password may have been exposed. Revoke every session,
        // including this one, and require a clean login with the new secret.
        $user->tokens()->delete();

        $this->securityAuditLogger->record(
            request: $request,
            event: 'auth.password.changed',
            outcome: 'success',
            user: $user,
            metadata: ['all_tokens_revoked' => true]
        );

        return response()->json([
            'message' => 'パスワードを変更しました。新しいパスワードで再度ログインしてください。',
            'reauthentication_required' => true,
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }

    /**
     * Update the authenticated employee's avatar without granting access to
     * another employee profile.
     */
    public function updateAvatar(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'avatar' => [
                'required',
                'file',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'max:2048',
                'dimensions:max_width=2048,max_height=2048',
            ],
        ], [
            'avatar.image' => 'プロフィール画像は画像ファイルを選択してください。',
            'avatar.mimes' => 'プロフィール画像はJPG、PNG、WebP形式でアップロードしてください。',
            'avatar.max' => 'プロフィール画像は2MB以下にしてください。',
        ]);

        $user = $request->user()->load('employee');

        if ($user->employee === null) {
            return response()->json([
                'message' => 'このアカウントには社員プロフィールが登録されていません。',
            ], 403);
        }

        $employee = $user->employee;
        $previousPath = $employee->avatar_path;
        $storedPath = $validated['avatar']->store('avatars', 'public');

        $employee->forceFill([
            'avatar_path' => Storage::disk('public')->url($storedPath),
        ])->save();

        if (is_string($previousPath) && str_starts_with($previousPath, '/storage/avatars/')) {
            Storage::disk('public')->delete(ltrim(substr($previousPath, strlen('/storage/')), '/'));
        }

        return response()->json([
            'message' => 'プロフィール画像を更新しました。',
            'user' => $user->fresh([
                'employee.office',
                'employee.department',
                'roles.permissions',
            ]),
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
