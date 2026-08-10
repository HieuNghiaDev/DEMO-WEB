<?php

use App\Http\Controllers\Api\AttendanceController;
use Illuminate\Support\Facades\Route;

Route::prefix('attendances')->group(function () {
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