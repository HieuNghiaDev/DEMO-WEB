<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DocumentNameCatalogController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['document_names' => DB::table('document_name_catalog')->where('is_active', true)->orderBy('sort_order')->pluck('name')]);
    }
}
