<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\Response;

class EmployeeAvatarController extends Controller
{
    public function show(string $token): Response
    {
        $employee = Employee::query()
            ->where('avatar_token', $token)
            ->firstOrFail();

        if (! is_string($employee->avatar_data) || $employee->avatar_data === '') {
            abort(404);
        }

        $avatar = base64_decode($employee->avatar_data, true);

        if ($avatar === false) {
            abort(404);
        }

        return response($avatar, 200, [
            'Content-Type' => $employee->avatar_mime_type ?: 'image/webp',
            'Content-Length' => (string) strlen($avatar),
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
