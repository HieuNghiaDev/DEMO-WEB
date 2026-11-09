<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CasePrecedentController extends Controller
{
    public function index(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['precedents' => $caseFile->precedents()->latest()->get()]);
    }

    public function store(Request $request, CaseFile $caseFile, CaseWorkspaceAuditService $audit): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'], 'citation' => ['nullable', 'string', 'max:255'],
            'summary' => ['nullable', 'string'], 'relevance' => ['nullable', 'string'], 'source_url' => ['nullable', 'url', 'max:2048'],
        ]);

        // Legacy clients may send attribution; only the authenticated actor is trusted.
        $data['created_by_employee_id'] = $request->user()->employee_id;
        $data['created_by_ai_name'] = null;
        $precedent = DB::transaction(function () use ($caseFile, $data, $request, $audit) {
            $precedent = $caseFile->precedents()->create($data);
            $audit->record($caseFile, $request, '判例を追加', $precedent->title, [
                'event' => 'precedent.created', 'precedent_id' => $precedent->id,
            ]);

            return $precedent;
        });

        return response()->json(['precedent' => $precedent], 201);
    }
}
