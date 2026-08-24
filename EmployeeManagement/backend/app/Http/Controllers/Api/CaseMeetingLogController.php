<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Models\CaseMeetingLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CaseMeetingLogController extends Controller
{
    public function index(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['meeting_logs' => $caseFile->meetingLogs()->latest('meeting_date')->get()]);
    }

    public function store(Request $request, CaseFile $caseFile): JsonResponse
    {
        $log = $caseFile->meetingLogs()->create($this->validated($request));

        return response()->json(['meeting_log' => $log], 201);
    }

    public function update(Request $request, CaseFile $caseFile, CaseMeetingLog $meetingLog): JsonResponse
    {
        abort_unless($meetingLog->case_file_id === $caseFile->id, 404);
        $meetingLog->update($this->validated($request, true));

        return response()->json(['meeting_log' => $meetingLog]);
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
