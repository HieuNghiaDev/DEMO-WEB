<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CasePrecedentController extends Controller
{
    public function index(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['precedents' => $caseFile->precedents()->latest()->get()]);
    }

    public function store(Request $request, CaseFile $caseFile): JsonResponse
    {
        $precedent = $caseFile->precedents()->create($request->validate([
            'title' => ['required', 'string', 'max:255'], 'citation' => ['nullable', 'string', 'max:255'],
            'summary' => ['nullable', 'string'], 'relevance' => ['nullable', 'string'], 'source_url' => ['nullable', 'url', 'max:2048'],
            'created_by_employee_id' => ['nullable', 'exists:employees,id'], 'created_by_ai_name' => ['nullable', 'string', 'max:255'],
        ]));

        return response()->json(['precedent' => $precedent], 201);
    }
}
