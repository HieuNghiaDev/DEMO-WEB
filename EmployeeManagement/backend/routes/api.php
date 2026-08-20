<?php

use App\Http\Controllers\Api\AiChatController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CaseDocumentController;
use App\Http\Controllers\Api\CaseFileController;
use App\Http\Controllers\Api\CaseMeetingLogController;
use App\Http\Controllers\Api\CasePrecedentController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\EmployeeTaskController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\PersonaController;
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

    Route::get('/organization', [
        OrganizationController::class,
        'index',
    ]);

    Route::get('/personas', [
        PersonaController::class,
        'index',
    ]);

    Route::post('/ai/chat', [
        AiChatController::class,
        'store',
    ]);

    Route::apiResource('clients', ClientController::class);
    Route::apiResource('case-files', CaseFileController::class);

    Route::prefix('case-files/{caseFile}')->group(function () {
        Route::get('documents', [CaseDocumentController::class, 'index']);
        Route::post('documents', [CaseDocumentController::class, 'store']);
        Route::patch('documents/{document}', [CaseDocumentController::class, 'update']);
        Route::delete('documents/{document}', [CaseDocumentController::class, 'destroy']);
        Route::get('precedents', [CasePrecedentController::class, 'index']);
        Route::post('precedents', [CasePrecedentController::class, 'store']);
        Route::get('meeting-logs', [CaseMeetingLogController::class, 'index']);
        Route::post('meeting-logs', [CaseMeetingLogController::class, 'store']);
        Route::patch('meeting-logs/{meetingLog}', [CaseMeetingLogController::class, 'update']);
    });

    Route::prefix('attendances')->group(function () {

        Route::get('/my-report', [
            AttendanceController::class,
            'personalReport',
        ]);

        Route::get('/my-history', [
            AttendanceController::class,
            'history',
        ]);

        Route::get('/my-timeline', [
            AttendanceController::class,
            'timeline',
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

    Route::post(
        '/employees/{employee}/tasks',
        [EmployeeTaskController::class, 'store']
    );

    Route::get(
        '/my/tasks',
        [EmployeeTaskController::class, 'myTasks']
    );

    Route::patch(
        '/tasks/{task}/accept',
        [EmployeeTaskController::class, 'accept']
    );

    Route::patch(
        '/tasks/{task}/status',
        [EmployeeTaskController::class, 'updateStatus']
    );
});
