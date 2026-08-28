<?php

use App\Http\Controllers\Api\AiChatController;
use App\Http\Controllers\Api\ApprovalRequestController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CaseDocumentController;
use App\Http\Controllers\Api\CaseCustomSectionController;
use App\Http\Controllers\Api\CaseFileController;
use App\Http\Controllers\Api\CaseMeetingLogController;
use App\Http\Controllers\Api\CasePrecedentController;
use App\Http\Controllers\Api\CaseTypeController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\EmployeeNotificationController;
use App\Http\Controllers\Api\EmployeeTaskController;
use App\Http\Controllers\Api\DocumentNameCatalogController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\PersonaController;
use App\Http\Controllers\Api\VisaProgressController;
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
    'password.changed',
])->group(function () {

    Route::get('/me', [
        AuthController::class,
        'me',
    ])->withoutMiddleware('password.changed');

    Route::post('/logout', [
        AuthController::class,
        'logout',
    ])->withoutMiddleware('password.changed');

    Route::put('/password', [
        AuthController::class,
        'changePassword',
    ])->middleware('throttle:5,1')->withoutMiddleware('password.changed');

    Route::get('/organization', [
        OrganizationController::class,
        'index',
    ])->middleware('permission:employee.view');

    Route::post('/employees', [
        OrganizationController::class,
        'store',
    ])->middleware('permission:employee.create');

    Route::put('/employees/{employee}/roles', [
        OrganizationController::class,
        'updateRoles',
    ])->middleware('permission:employee.manage_roles');

    Route::put('/employees/{employee}/employment', [
        OrganizationController::class,
        'updateEmployment',
    ])->middleware('permission:employee.update');
    Route::put('/employees/{employee}/password-reset', [
        OrganizationController::class,
        'resetPassword',
    ])->middleware('permission:employee.update', 'throttle:5,1');

    Route::get('/notifications', [
        EmployeeNotificationController::class,
        'index',
    ]);
    Route::patch('/notifications/read-all', [
        EmployeeNotificationController::class,
        'markAllRead',
    ]);
    Route::patch('/notifications/{notification}/read', [
        EmployeeNotificationController::class,
        'markRead',
    ]);

    Route::get('/personas', [
        PersonaController::class,
        'index',
    ]);

    Route::post('/ai/chat', [
        AiChatController::class,
        'store',
    ])->middleware('permission:ai.use');

    Route::get('/approvals', [
        ApprovalRequestController::class,
        'index',
    ])->middleware('permission:approval.view');

    Route::patch('/approvals/{approval}/approve', [
        ApprovalRequestController::class,
        'approve',
    ])->middleware('permission:approval.approve');

    Route::patch('/approvals/{approval}/reject', [
        ApprovalRequestController::class,
        'reject',
    ])->middleware('permission:approval.approve');

    Route::post('/approvals/{approval}/execute', [
        ApprovalRequestController::class,
        'execute',
    ])->middleware('permission:approval.approve');

    Route::apiResource('clients', ClientController::class)
        ->only(['index', 'show'])
        ->middleware('permission:case.view');
    Route::apiResource('clients', ClientController::class)
        ->only(['store'])
        ->middleware('permission:case.create');
    Route::apiResource('clients', ClientController::class)
        ->only(['update'])
        ->middleware('permission:case.update');
    Route::apiResource('clients', ClientController::class)
        ->only(['destroy'])
        ->middleware('permission:case.delete');

    Route::apiResource('case-files', CaseFileController::class)
        ->only(['index', 'show'])
        ->middleware('permission:case.view');
    Route::apiResource('case-files', CaseFileController::class)
        ->only(['store'])
        ->middleware('permission:case.create');
    Route::apiResource('case-files', CaseFileController::class)
        ->only(['update'])
        ->middleware('permission:case.update');
    Route::patch('/case-files/{caseFile}/assignee', [
        CaseFileController::class,
        'assign',
    ])->middleware('permission:case.assign');
    Route::apiResource('case-files', CaseFileController::class)
        ->only(['destroy'])
        ->middleware('permission:case.delete');

    Route::get('/case-types', [CaseTypeController::class, 'index'])
        ->middleware('permission:case.view');
    Route::get('/document-name-catalog', [DocumentNameCatalogController::class, 'index'])
        ->middleware('permission:document.view');

    Route::get('/visa-progress', [VisaProgressController::class, 'index'])
        ->middleware('permission:case.view');

    Route::prefix('case-files/{caseFile}')->group(function () {
        Route::post('custom-sections', [CaseCustomSectionController::class, 'store'])
            ->middleware('permission:case.update');
        Route::patch('custom-sections/{customSection}', [CaseCustomSectionController::class, 'update'])
            ->middleware('permission:case.update');
        Route::delete('custom-sections/{customSection}', [CaseCustomSectionController::class, 'destroy'])
            ->middleware('permission:case.update');
        Route::get('documents', [CaseDocumentController::class, 'index'])
            ->middleware('permission:document.view');
        Route::post('documents', [CaseDocumentController::class, 'store'])
            ->middleware('permission:document.create');
        Route::patch('documents/{document}', [CaseDocumentController::class, 'update'])
            ->middleware('permission:document.update');
        Route::delete('documents/{document}', [CaseDocumentController::class, 'destroy'])
            ->middleware('permission:document.delete');
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
        ])->middleware('permission:attendance.export_own');

        Route::get('/my-history', [
            AttendanceController::class,
            'history',
        ])->middleware('permission:attendance.view_own');

        Route::get('/my-timeline', [
            AttendanceController::class,
            'timeline',
        ])->middleware('permission:attendance.view_own');

        Route::get('/active', [
            AttendanceController::class,
            'active',
        ]);

        Route::post('/start', [
            AttendanceController::class,
            'start',
        ])->middleware('permission:attendance.update_own');

        Route::patch('/{attendance}/status', [
            AttendanceController::class,
            'updateStatus',
        ])->middleware('permission:attendance.update_own');
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
    )->middleware('permission:task.assign');

    Route::get(
        '/my/tasks',
        [EmployeeTaskController::class, 'myTasks']
    )->middleware('permission:task.view_own');

    Route::patch(
        '/tasks/{task}/accept',
        [EmployeeTaskController::class, 'accept']
    )->middleware('permission:task.update');

    Route::patch(
        '/tasks/{task}/status',
        [EmployeeTaskController::class, 'updateStatus']
    )->middleware('permission:task.update');
});
