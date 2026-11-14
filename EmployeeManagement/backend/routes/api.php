<?php

use App\Http\Controllers\Api\AiChatController;
use App\Http\Controllers\Api\AppReleaseController;
use App\Http\Controllers\Api\ApprovalRequestController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CaseCustomSectionController;
use App\Http\Controllers\Api\CaseDocumentCollectionController;
use App\Http\Controllers\Api\CaseDocumentController;
use App\Http\Controllers\Api\CaseDocumentCreationController;
use App\Http\Controllers\Api\CaseDocumentInitializationController;
use App\Http\Controllers\Api\CaseFileController;
use App\Http\Controllers\Api\CaseMeetingLogController;
use App\Http\Controllers\Api\CasePrecedentController;
use App\Http\Controllers\Api\CaseTypeController;
use App\Http\Controllers\Api\CaseWorkspaceController;
use App\Http\Controllers\Api\CaseWorkspaceItemController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ClientEmploymentController;
use App\Http\Controllers\Api\DocumentNameCatalogController;
use App\Http\Controllers\Api\EmployeeAvatarController;
use App\Http\Controllers\Api\EmployeeNotificationController;
use App\Http\Controllers\Api\EmployeeTaskController;
use App\Http\Controllers\Api\InternalChatController;
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

// Token/password are POST-body only. Link previews have no consuming GET route.
Route::post('/account-activation/complete', [\App\Http\Controllers\Api\AccountActivationController::class, 'complete'])
    ->middleware('throttle:5,1');

Route::post('/mfa/enrollment/start', [\App\Http\Controllers\Api\MfaController::class, 'start'])->middleware('throttle:mfa-enroll-start');
Route::post('/mfa/enrollment/confirm', [\App\Http\Controllers\Api\MfaController::class, 'confirm'])->middleware('throttle:mfa-enroll-confirm');
Route::post('/mfa/login', [\App\Http\Controllers\Api\MfaController::class, 'login'])->middleware('throttle:mfa-login');

// Avatar URLs are embedded directly in <img> elements, so they cannot attach
// the bearer token. Versioned URLs are public and contain no profile metadata.
Route::get('/employee-avatars/{token}', [
    EmployeeAvatarController::class,
    'show',
])->where('token', '[A-Za-z0-9]{64}')->name('employee-avatar.show');

Route::middleware([
    'auth:sanctum',
    'account.active',
    'case.rehearsal',
    'throttle:60,1',
    'password.changed',
])->group(function () {

    Route::post('/mfa/step-up', [\App\Http\Controllers\Api\MfaController::class, 'stepUp'])->middleware('throttle:mfa-step-up');
    Route::post('/mfa/recovery-codes/regenerate', [\App\Http\Controllers\Api\MfaController::class, 'regenerate'])->middleware('throttle:mfa-codes');
    Route::post('/mfa/device/change', [\App\Http\Controllers\Api\MfaController::class, 'changeDevice'])->middleware('throttle:mfa-device');
    Route::get('/mfa/settings', [\App\Http\Controllers\Api\MfaController::class, 'settings']);
    Route::post('/mfa/enrollment/opt-in', [\App\Http\Controllers\Api\MfaController::class, 'optIn'])->middleware('throttle:mfa-enroll-start');
    Route::post('/mfa/disable', [\App\Http\Controllers\Api\MfaController::class, 'disable'])->middleware('throttle:mfa-device');

    Route::get('/me', [
        AuthController::class,
        'me',
    ])->withoutMiddleware('password.changed');

    Route::post('/presence/heartbeat', [
        AuthController::class,
        'heartbeat',
    ])->withoutMiddleware('password.changed');

    Route::post('/logout', [
        AuthController::class,
        'logout',
    ])->withoutMiddleware('password.changed');

    Route::put('/password', [
        AuthController::class,
        'changePassword',
    ])->middleware('throttle:password-change')->withoutMiddleware('password.changed');

    Route::post('/me/avatar', [
        AuthController::class,
        'updateAvatar',
    ])->middleware('throttle:10,1');

    Route::get('/me/email-change', [\App\Http\Controllers\Api\AccountEmailController::class, 'status']);
    Route::post('/me/email-change', [\App\Http\Controllers\Api\AccountEmailController::class, 'issue'])->middleware('throttle:email-change-send');
    Route::post('/me/email-change/confirm', [\App\Http\Controllers\Api\AccountEmailController::class, 'confirm'])->middleware('throttle:email-change-confirm');

    Route::get('/system/release/current', [
        AppReleaseController::class,
        'current',
    ]);

    Route::get('/developer/releases', [
        AppReleaseController::class,
        'index',
    ])->middleware('permission:developer.view');

    Route::post('/developer/releases', [
        AppReleaseController::class,
        'store',
    ])->middleware('permission:developer.release.manage', 'throttle:10,1');

    Route::get('/organization', [
        OrganizationController::class,
        'index',
    ])->middleware('permission:employee.view');

    Route::post('/employees', [
        OrganizationController::class,
        'store',
    ])->middleware('permission:employee.create');

    Route::delete('/employees/{employee}', [
        OrganizationController::class,
        'destroy',
    ])->middleware('permission:employee.disable');

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
    ])->middleware('permission:employee.reset_password', 'throttle:password-reset');

    Route::post('/employees/{employee}/activation-invite', [
        OrganizationController::class,
        'issueActivationInvite',
    ])->middleware('throttle:5,1,activation-invite:');

    Route::get('/notifications', [
        EmployeeNotificationController::class,
        'index',
    ]);
    Route::get('/notifications/center', [EmployeeNotificationController::class, 'center']);
    Route::patch('/notifications/read-all', [
        EmployeeNotificationController::class,
        'markAllRead',
    ]);
    Route::patch('/notifications/{notification}/read', [
        EmployeeNotificationController::class,
        'markRead',
    ]);

    Route::prefix('internal-chat')->group(function (): void {
        Route::get('/members', [InternalChatController::class, 'members']);
        Route::get('/messages', [InternalChatController::class, 'index']);
        Route::post('/messages', [InternalChatController::class, 'store'])->middleware('throttle:internal-chat-send');
        Route::get('/pins', [InternalChatController::class, 'pins']);
        Route::get('/messages/{message}', [InternalChatController::class, 'show'])->whereNumber('message');
        Route::post('/messages/{message}/translations', [InternalChatController::class, 'translate'])
            ->whereNumber('message')->middleware('throttle:internal-chat-send');
        Route::get('/messages/{message}/attachments/{attachment}', [InternalChatController::class, 'downloadAttachment'])
            ->whereNumber(['message', 'attachment']);
        Route::patch('/messages/{message}/{action}', [InternalChatController::class, 'messageAction'])
            ->whereNumber('message')->whereIn('action', ['recall', 'pin', 'unpin', 'hide', 'retry'])->middleware('throttle:internal-chat-send');
        Route::get('/unread', [InternalChatController::class, 'unread']);
        Route::patch('/read', [InternalChatController::class, 'markRead']);
        Route::patch('/delivered', [InternalChatController::class, 'markDelivered']);
    });

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
    Route::post('/clients/{client}/google-drive/provision', [ClientController::class, 'provisionDrive'])
        ->middleware('permission:case.update');
    Route::get('/clients/{client}/employments', [ClientEmploymentController::class, 'index'])
        ->middleware('permission:case.view');
    Route::post('/clients/{client}/employments', [ClientEmploymentController::class, 'store'])
        ->middleware('permission:case.update');
    Route::patch('/clients/{client}/employments/{employment}', [ClientEmploymentController::class, 'update'])
        ->middleware('permission:case.update');
    Route::delete('/clients/{client}/employments/{employment}', [ClientEmploymentController::class, 'destroy'])
        ->middleware('permission:case.update');

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
    Route::post('/case-files/{caseFile}/google-drive/provision', [CaseFileController::class, 'provisionDrive'])
        ->middleware('permission:case.update');

    Route::get('/case-types', [CaseTypeController::class, 'index'])
        ->middleware('permission:case.view');
    Route::get('/document-name-catalog', [DocumentNameCatalogController::class, 'index'])
        ->middleware('permission:document.view');

    Route::get('/visa-progress', [VisaProgressController::class, 'index'])
        ->middleware('permission:case.view');

    Route::prefix('case-files/{caseFile}')->group(function () {
        Route::prefix('interpretation-requests')->controller(\App\Http\Controllers\Api\InterpretationRequestController::class)->group(function () {
            Route::get('/', 'index')->middleware('permission:interpretation.view');
            Route::get('options', 'options')->middleware('permission:interpretation.view');
            Route::post('interpreters', 'registerInterpreter')->middleware('permission:interpretation.assign');
            Route::post('conflicts', 'conflicts')->middleware('permission:interpretation.assign');
            Route::post('/', 'store')->middleware('permission:interpretation.create');
            Route::get('{interpretationRequest}', 'show')->whereNumber('interpretationRequest')->middleware('permission:interpretation.view');
            Route::patch('{interpretationRequest}', 'update')->whereNumber('interpretationRequest')->middleware('permission:interpretation.update');
            Route::patch('{interpretationRequest}/assignment', 'assignment')->whereNumber('interpretationRequest')->middleware('permission:interpretation.assign');
            Route::post('{interpretationRequest}/status', 'status')->whereNumber('interpretationRequest')->middleware('permission:interpretation.transition,interpretation.cancel');
            Route::get('{interpretationRequest}/history', 'history')->whereNumber('interpretationRequest')->middleware('permission:interpretation.view');
        });
        Route::get('document-collection/initialization-preview', [CaseDocumentInitializationController::class, 'preview'])
            ->middleware('permission:case.view');
        Route::post('document-collection/initialize', [CaseDocumentInitializationController::class, 'initialize'])
            ->middleware('permission:case.update');
        Route::get('document-collection', [CaseDocumentCollectionController::class, 'index'])
            ->middleware('permission:case.view');
        Route::patch('document-collection/bulk-necessity', [CaseDocumentCollectionController::class, 'bulkUpdateNecessity'])
            ->middleware('permission:case.update');
        Route::get('document-collection/{caseDocument}/received-documents/{receivedDocument}/download', [CaseDocumentCollectionController::class, 'downloadReceivedDocument'])
            ->middleware('permission:case.view');
        Route::post('document-collection/{caseDocument}/received-documents', [CaseDocumentCollectionController::class, 'storeReceivedDocument'])
            ->middleware('permission:case.view');
        Route::post('document-collection/{caseDocument}/file-review', [CaseDocumentCollectionController::class, 'reviewFile'])
            ->middleware(['permission:case.view', 'permission:task.review']);
        Route::get('document-collection/{caseDocument}/creation', [CaseDocumentCreationController::class, 'show'])
            ->middleware('permission:case.view');
        Route::patch('document-collection/{caseDocument}/creation/draft', [CaseDocumentCreationController::class, 'saveDraft'])
            ->middleware('permission:case.update,task.update');
        Route::post('document-collection/{caseDocument}/creation/review', [CaseDocumentCreationController::class, 'review'])
            ->middleware('permission:case.update,task.update');
        Route::get('document-collection/{caseDocument}/creation/c001/preview', [CaseDocumentCreationController::class, 'previewC001'])
            ->middleware('permission:case.view');
        Route::get('document-collection/{caseDocument}/creation/c001/download', [CaseDocumentCreationController::class, 'downloadC001'])
            ->middleware('permission:case.view');
        Route::get('document-collection/{caseDocument}/creation/c001/pdf', [CaseDocumentCreationController::class, 'pdfC001'])
            ->middleware('permission:case.view');
        Route::post('document-collection/{caseDocument}/creation/c001/sync', [CaseDocumentCreationController::class, 'syncC001'])
            ->middleware('permission:case.update,task.update');
        Route::post('document-collection/{caseDocument}/creation/approve', [CaseDocumentCreationController::class, 'approve'])
            ->middleware('permission:task.review');
        Route::post('document-collection/{caseDocument}/creation/reject', [CaseDocumentCreationController::class, 'reject'])
            ->middleware('permission:task.review');
        Route::post('document-collection/{caseDocument}/creation/c001/reject', [CaseDocumentCreationController::class, 'reject'])
            ->middleware('permission:task.review');
        Route::post('document-collection/{caseDocument}/creation/revision', [CaseDocumentCreationController::class, 'revision'])
            ->middleware('permission:case.update');
        Route::get('document-collection/{caseDocument}/creation/approved', [CaseDocumentCreationController::class, 'approved'])
            ->middleware('permission:case.view');
        Route::get('document-collection/{caseDocument}/creation/pdf', [CaseDocumentCreationController::class, 'pdf'])
            ->middleware('permission:case.view');
        Route::post('document-collection/{caseDocument}/creation/google-drive', [CaseDocumentCreationController::class, 'googleDrive'])
            ->middleware('permission:case.update');
        Route::get('document-collection/{caseDocument}', [CaseDocumentCollectionController::class, 'show'])
            ->middleware('permission:case.view');
        Route::patch('document-collection/{caseDocument}', [CaseDocumentCollectionController::class, 'update'])
            ->middleware('permission:case.update');
        Route::get('workspace', [CaseWorkspaceController::class, 'show'])
            ->middleware('permission:case.view');
        Route::patch('incident', [CaseWorkspaceController::class, 'updateIncident'])
            ->middleware('permission:case.update');
        Route::post('apply-document-template', [CaseWorkspaceController::class, 'applyTemplate'])
            ->middleware('permission:document.create');
        Route::post('parties', [CaseWorkspaceItemController::class, 'storeParty'])->middleware('permission:case.update');
        Route::patch('parties/{party}', [CaseWorkspaceItemController::class, 'updateParty'])->middleware('permission:case.update');
        Route::delete('parties/{party}', [CaseWorkspaceItemController::class, 'destroyParty'])->middleware('permission:case.update');
        Route::post('deadlines', [CaseWorkspaceItemController::class, 'storeDeadline'])->middleware('permission:case.update');
        Route::patch('deadlines/{deadline}', [CaseWorkspaceItemController::class, 'updateDeadline'])->middleware('permission:case.update');
        Route::delete('deadlines/{deadline}', [CaseWorkspaceItemController::class, 'destroyDeadline'])->middleware('permission:case.update');
        Route::post('case-tasks', [CaseWorkspaceItemController::class, 'storeTask'])->middleware('permission:task.manage,task.create');
        Route::get('case-tasks', [CaseWorkspaceItemController::class, 'indexTasks'])->middleware('permission:case.view');
        Route::get('case-tasks/options', [CaseWorkspaceItemController::class, 'taskOptions'])->middleware('permission:task.manage');
        Route::get('case-tasks/{task}', [CaseWorkspaceItemController::class, 'showTask'])->middleware('permission:case.view');
        Route::post('case-tasks/batch', [CaseWorkspaceItemController::class, 'storeTaskBatch'])->middleware('permission:task.manage');
        Route::post('case-tasks/{task}/accept', [CaseWorkspaceItemController::class, 'acceptTask'])->middleware('permission:task.update');
        Route::post('case-tasks/{task}/submissions', [CaseWorkspaceItemController::class, 'submitTask'])->middleware('permission:task.update');
        Route::post('case-tasks/{task}/submissions/{submission}/approve', [CaseWorkspaceItemController::class, 'approveTaskSubmission'])->middleware('permission:task.review');
        Route::post('case-tasks/{task}/submissions/{submission}/reject', [CaseWorkspaceItemController::class, 'rejectTaskSubmission'])->middleware('permission:task.review');
        Route::patch('case-tasks/{task}', [CaseWorkspaceItemController::class, 'updateTask'])->middleware('permission:task.manage');
        Route::delete('case-tasks/{task}', [CaseWorkspaceItemController::class, 'destroyTask'])->middleware('permission:task.manage');
        Route::post('activities', [CaseWorkspaceItemController::class, 'storeActivity'])->middleware('permission:case.update');
        Route::get('history', [\App\Http\Controllers\Api\CaseHistoryController::class, 'index'])->middleware('permission:case.view');
        Route::get('history/options', [\App\Http\Controllers\Api\CaseHistoryController::class, 'options'])->middleware('permission:case.view');
        Route::prefix('history/uploads')
            ->withoutMiddleware('throttle:60,1')
            ->middleware(['permission:case.view', 'permission:case.update', 'throttle:180,1,case-history-uploads:'])
            ->group(function () {
                Route::post('/', [\App\Http\Controllers\Api\CaseHistoryController::class, 'startAttachmentUpload']);
                Route::post('{upload}', [\App\Http\Controllers\Api\CaseHistoryController::class, 'appendAttachmentChunk'])->whereUuid('upload');
                Route::delete('{upload}', [\App\Http\Controllers\Api\CaseHistoryController::class, 'discardAttachmentUpload'])->whereUuid('upload');
            });
        Route::post('communications', [\App\Http\Controllers\Api\CaseHistoryController::class, 'store'])->middleware(['permission:case.view', 'permission:case.update']);
        Route::get('communications/{communication}', [\App\Http\Controllers\Api\CaseHistoryController::class, 'show'])->middleware('permission:case.view');
        Route::get('communications/{communication}/attachments/{attachment}', [\App\Http\Controllers\Api\CaseHistoryController::class, 'attachment'])
            ->whereUuid('attachment')->middleware('permission:case.view');
        Route::patch('communications/{communication}', [\App\Http\Controllers\Api\CaseHistoryController::class, 'update'])->middleware(['permission:case.view', 'permission:case.update']);
        Route::post('communications/{communication}/task', [\App\Http\Controllers\Api\CaseHistoryController::class, 'task'])->middleware(['permission:case.view', 'permission:case.update', 'permission:task.manage']);
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
        Route::get('precedents', [CasePrecedentController::class, 'index'])->middleware('permission:case.view');
        Route::post('precedents', [CasePrecedentController::class, 'store'])->middleware(['permission:case.view', 'permission:case.update']);
        Route::get('meeting-logs', [CaseMeetingLogController::class, 'index'])->middleware('permission:case.view');
        Route::post('meeting-logs', [CaseMeetingLogController::class, 'store'])->middleware(['permission:case.view', 'permission:case.update']);
        Route::patch('meeting-logs/{meetingLog}', [CaseMeetingLogController::class, 'update'])->middleware(['permission:case.view', 'permission:case.update']);
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
    Route::get('/my/tasks/{task}', [EmployeeTaskController::class, 'myTask'])->middleware('permission:task.view_own');

    Route::patch(
        '/tasks/{task}/accept',
        [EmployeeTaskController::class, 'accept']
    )->middleware('permission:task.update');

    Route::patch(
        '/tasks/{task}/status',
        [EmployeeTaskController::class, 'updateStatus']
    )->middleware('permission:task.update');
});
