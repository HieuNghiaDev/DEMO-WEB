<?php

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\WorkSessionController;
use App\Http\Controllers\Api\OrganizationController;
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

    Route::get('/organization', [
        OrganizationController::class,
        'index',
    ]);

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
        ]);
    });
});
