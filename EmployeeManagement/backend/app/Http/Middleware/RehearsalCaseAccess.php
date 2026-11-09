<?php

namespace App\Http\Middleware;

use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\EmployeeTask;
use App\Services\CaseAccessService;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/** Shared runtime parent boundary, with additional strict-rehearsal restrictions under guarded binding. */
class RehearsalCaseAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $access = CaseAccessService::rehearsal();
        if (! $access) return $this->runtime($request, $next);

        // No reliable per-case ownership for these shared/external data sources yet.
        if ($request->is('api/clients', 'api/clients/*', 'api/visa-progress', 'api/ai/*')
            || ($request->is('api/case-files') && $request->isMethod('POST'))) {
            return response()->json(['code' => 'case_scope_policy_pending', 'message' => 'Rehearsal policy approval is required.'], 409);
        }
        $parameters = $request->route()?->parameters() ?? [];
        $case = collect($parameters)->first(fn ($value) => $value instanceof CaseFile);
        if ($case) {
            // Unknown and inaccessible case IDs have the same response, not an existence oracle.
            abort_unless(Gate::forUser($request->user())->allows('view', $case), 404);
            if (! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
                Gate::forUser($request->user())->authorize('operate', $case);
            }
            $request->attributes->set('b31_case_presentation', ['user_id' => $request->user()->id,
                'case_id' => $case->id, 'write' => $access->allows($request->user(), $case->id, 'write')]);
            foreach ($parameters as $model) {
                if ($model instanceof Model && $model->getAttribute('case_file_id') !== null) {
                    abort_unless((int) $model->case_file_id === $case->id, 404);
                }
                if ($model instanceof CaseTaskSubmission) {
                    $task = collect($parameters)->first(fn ($value) => $value instanceof CaseTask);
                    abort_unless($task && (int) $model->case_task_id === $task->id
                        && (int) $model->case_document_id === (int) $task->case_document_id, 404);
                }
            }
            // Existing final-legal workflow is NOT evidence of independently verified authority.
            // Keep it unchanged in default mode, but do not certify/enable it in this rehearsal.
            $generatedReview = $request->is('api/case-files/*/document-collection/*/creation/approve',
                'api/case-files/*/document-collection/*/creation/reject', 'api/case-files/*/document-collection/*/creation/c001/reject');
            $submission = collect($parameters)->first(fn ($value) => $value instanceof CaseTaskSubmission);
            if ($request->is('api/case-files/*/document-collection/*/file-review') && $request->input('source') === 'task_submission') {
                $id = $request->input('file_id');
                abort_unless((is_int($id) || is_string($id)) && preg_match('/^[1-9][0-9]*$/D', (string) $id) === 1, 404);
                $submission = CaseTaskSubmission::find($id);
                abort_unless($submission && $submission->caseDocument?->case_file_id === $case->id
                    && $submission->task?->case_file_id === $case->id, 404);
            }
            if ($generatedReview || ($submission && ($submission->source_type === 'auto_generated' || $submission->case_generated_document_id !== null)
                && ! in_array($request->method(), ['GET', 'HEAD'], true))) {
                return response()->json(['code' => 'legal_authority_policy_pending', 'message' => 'Independent legal authority mapping is required.'], 409);
            }
        }
        foreach ($parameters as $model) {
            if ($model instanceof \App\Models\ApprovalRequest) {
                abort_unless(app(\App\Services\ApprovalContextAccess::class)->allows($model, $request->user(),
                    ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)), 403);
            }
            if ($model instanceof EmployeeTask && $model->case_document_id !== null) {
                abort_unless($model->isVisibleTo($request->user()), 404);
                $caseId = $model->caseDocument()->withTrashed()->value('case_file_id');
                if (! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
                    $access->authorizeWrite($request->user(), (int) $caseId);
                }
            }
        }
        return $next($request);
    }

    private function runtime(Request $request, Closure $next): Response
    {
        $parameters = $request->route()?->parameters() ?? [];
        $write = ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true);
        $case = collect($parameters)->first(fn ($value) => $value instanceof CaseFile);
        if ($case) {
            abort_unless($request->user()?->hasPermission('case.view'), 403);
            // Preserve A01's existing 403 contract for the legacy document controller.
            $denial = $request->route()?->getControllerClass() === \App\Http\Controllers\Api\CaseDocumentController::class ? 403 : 404;
            abort_unless(Gate::forUser($request->user())->allows('view', $case), $denial);
            if ($write) Gate::forUser($request->user())->authorize('operate', $case);
            foreach ($parameters as $model) {
                if ($model instanceof Model && $model->getAttribute('case_file_id') !== null) {
                    abort_unless((int) $model->case_file_id === $case->id, 404);
                }
                if ($model instanceof CaseTaskSubmission) {
                    $task = collect($parameters)->first(fn ($value) => $value instanceof CaseTask);
                    abort_unless($task && (int) $model->case_task_id === $task->id
                        && (int) $model->case_document_id === (int) $task->case_document_id, 404);
                }
            }
        }
        foreach ($parameters as $model) {
            if ($model instanceof \App\Models\Client) {
                abort_unless(CaseAccessService::clientsVisibleTo($model->newQuery(), $request->user())->whereKey($model->id)->exists(), 404);
                // Shared-client mutation must not cascade into a case outside content scope.
                if ($write) abort_if($model->caseFiles()->withTrashed()->whereNotIn('id',
                    CaseAccessService::contentScope(CaseFile::withTrashed(), $request->user(), 'write')->select('case_files.id'))->exists(), 403);
            }
            if ($model instanceof EmployeeTask && $model->case_document_id !== null) {
                abort_unless($model->isVisibleTo($request->user()), 404);
                if ($write) abort_unless(CaseAccessService::contentAllows($request->user(),
                    (int) $model->caseDocument()->withTrashed()->value('case_file_id'), 'write'), 403);
            }
        }
        if ($request->is('api/case-files') && $request->isMethod('POST') && $request->filled('client_id')) {
            $client = $request->input('client_id');
            if ((is_int($client) || is_string($client)) && preg_match('/^[1-9][0-9]*$/D', (string) $client)) {
                abort_unless(CaseAccessService::clientsVisibleTo(\App\Models\Client::query(), $request->user())->whereKey($client)->exists(), 404);
            }
        }
        return $next($request);
    }
}
