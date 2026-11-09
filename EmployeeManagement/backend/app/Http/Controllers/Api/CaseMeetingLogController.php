<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Models\CaseMeetingLog;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CaseMeetingLogController extends Controller
{
    public function index(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['meeting_logs' => $caseFile->meetingLogs()->latest('meeting_date')->get()]);
    }

    public function store(Request $request, CaseFile $caseFile, CaseWorkspaceAuditService $audit): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by_employee_id'] = $request->user()?->employee_id;
        $log = DB::transaction(function () use ($request, $caseFile, $data, $audit) {
            $log = $caseFile->meetingLogs()->create($data);
            $audit->record($caseFile, $request, '連絡・面談履歴を追加', $log->content, ['event' => 'communication.legacy_created', 'meeting_log_id' => $log->id]);

            return $log;
        });

        return response()->json(['meeting_log' => $log], 201);
    }

    public function update(Request $request, CaseFile $caseFile, CaseMeetingLog $meetingLog, CaseWorkspaceAuditService $audit): JsonResponse
    {
        abort_unless($meetingLog->case_file_id === $caseFile->id, 404);
        $data = $this->validated($request, true);
        unset($data['created_by_employee_id']);
        DB::transaction(function () use ($request, $caseFile, $meetingLog, $data, $audit) {
            $log = $caseFile->meetingLogs()->whereKey($meetingLog->id)->lockForUpdate()->firstOrFail();
            $before = $log->only(array_keys($data));
            $log->fill($data);
            if (! $log->isDirty()) {
                return;
            }
            $log->save();
            $audit->record($caseFile, $request, '連絡・面談履歴を更新', $log->content, [
                'event' => 'communication.legacy_updated', 'meeting_log_id' => $log->id,
                'before' => $before, 'after' => $log->only(array_keys($data)),
            ]);
        });

        return response()->json(['meeting_log' => $meetingLog->fresh()]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'meeting_date' => [$partial ? 'sometimes' : 'required', 'date'],
            'interaction_type' => ['nullable', Rule::in(['meeting', 'phone', 'email', 'internal_note'])],
            'attendees' => ['nullable', 'string', 'max:255'],
            'content' => [$partial ? 'sometimes' : 'required', 'string'], 'next_action' => ['nullable', 'string'],
            'next_action_due_at' => ['nullable', 'date'],
            'status' => ['nullable', Rule::in(['draft', 'confirmed'])], 'created_by_employee_id' => ['nullable', 'exists:employees,id'],
            'created_by_ai_name' => ['nullable', 'string', 'max:255'], 'confirmed_by_employee_id' => ['nullable', 'exists:employees,id'], 'confirmed_at' => ['nullable', 'date'],
        ]);
    }
}
