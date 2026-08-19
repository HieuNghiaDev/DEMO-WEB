<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Persona;
use Illuminate\Http\JsonResponse;

class PersonaController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'personas' => Persona::query()
                ->where('active', true)
                ->orderBy('id')
                ->get(['id', 'name', 'display_name', 'skills']),
        ]);
    }
}
