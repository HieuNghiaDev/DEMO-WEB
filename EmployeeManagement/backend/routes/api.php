<?php

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\WorkSessionController;
use Illuminate\Support\Facades\Route;

// Authentication: không nằm trong prefix attendances
Route::post('/login', [
    AuthController::class,
    'login',
])->middleware('throttle:5,1');

Route::middleware([
    'auth:sanctum',
    'throttle:60,1',
])->group(function () {
    Route::get('/me', [
        AuthController::class,
        'me',
    ]);

    Route::post('/logout', [
        AuthController::class,
        'logout',
    ]);

    // Attendance: only authenticated employees can read or update attendance data.
    Route::prefix('attendances')->group(function () {
        Route::get('/my-report', [
            AttendanceController::class,
            'personalReport',
        ]);

        Route::get('/active', [
            AttendanceController::class,
            'active',
        ]);

        Route::post('/start', [
            AttendanceController::class,
            'start',
        ]);

        Route::patch('/{attendance}/status', [
            AttendanceController::class,
            'updateStatus',
        ]);
    });

    Route::prefix('work-sessions')->group(function () {
        Route::post('/', [
            WorkSessionController::class,
            'start',
        ]);

        Route::patch('/{workSession}/complete', [
            WorkSessionController::class,
            'complete',
        ])->missing(fn () => response()->json([
            'message' => '対象の作業はすでに削除されたか、完了しています。',
        ], 404));
    });
});
