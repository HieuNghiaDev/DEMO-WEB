<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ChecklistPlanningException;
use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Services\CaseDocumentChecklistGenerator;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CaseDocumentInitializationController extends Controller
{
    public function preview(CaseFile $caseFile, CaseDocumentChecklistGenerator $generator): JsonResponse
    {
        try {
            return response()->json($generator->previewForCase($caseFile));
        } catch (ChecklistPlanningException) {
            return $this->planningUnavailable();
        }
    }

    public function initialize(Request $request, CaseFile $caseFile, CaseDocumentChecklistGenerator $generator, CaseWorkspaceAuditService $audit): JsonResponse
    {
        if ($request->all() !== []) {
            throw ValidationException::withMessages(['payload' => '作成する資料や実行者を指定することはできません。']);
        }
        try {
            // Outer transaction is only for the case-type gate + atomic activity. The generator
            // retains its own transaction/parent lock; same lock order, no external side effects.
            return $caseFile->getConnection()->transaction(function () use ($request, $caseFile, $generator, $audit) {
                $case = CaseFile::on($caseFile->getConnectionName())->whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
                if ($case->case_type_id === null || ! CaseType::on($case->getConnectionName())->whereKey($case->case_type_id)->exists()) {
                    return response()->json(['code' => 'case_type_required', 'message' => '事件類型を設定してから収集リストを作成してください。'], 422);
                }
                $result = $generator->generateForCase($case);
                if ($result['created_count'] > 0) {
                    $audit->record($case, $request, '資料収集リストを作成', "候補資料を{$result['created_count']}件追加しました。", [
                        'event' => 'document_collection_initialized', 'actor_user_id' => $request->user()->id,
                        'created_count' => $result['created_count'], 'candidate_count' => $result['candidate_count'],
                    ]);
                }

                return response()->json(['initialization' => $result + ['total_collection_items' => $case->documents()->count()]]);
            });
        } catch (ChecklistPlanningException) {
            return $this->planningUnavailable();
        }
    }

    private function planningUnavailable(): JsonResponse
    {
        return response()->json(['code' => 'checklist_planning_unavailable',
            'message' => '候補資料の設定を確認する必要があります。管理者に確認してください。'], 422);
    }
}
