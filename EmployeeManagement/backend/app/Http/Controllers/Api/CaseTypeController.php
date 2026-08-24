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
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get(['id', 'name', 'name_kana']),
        ]);
    }
}
