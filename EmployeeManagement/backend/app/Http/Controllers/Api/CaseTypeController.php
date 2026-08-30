<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseType;
use Illuminate\Http\JsonResponse;

class CaseTypeController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'case_types' => CaseType::query()
                ->where('is_active', true)
                ->with(['parent:id,name', 'children' => fn ($query) => $query->where('is_active', true)->select(['id', 'parent_id', 'name', 'name_kana', 'description', 'sort_order'])])
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get(['id', 'parent_id', 'name', 'name_kana', 'description', 'sort_order']),
        ]);
    }
}
