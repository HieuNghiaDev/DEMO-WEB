<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CaseDocumentController extends Controller
{
    public function index(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['documents' => $caseFile->documents()->latest()->get()]);
    }

    public function store(Request $request, CaseFile $caseFile): JsonResponse
    {
        $document = $caseFile->documents()->create($this->validated($request));

        return response()->json(['document' => $document], 201);
    }

    public function update(Request $request, CaseFile $caseFile, CaseDocument $document): JsonResponse
    {
        abort_unless($document->case_file_id === $caseFile->id, 404);
        $document->update($this->validated($request, true));

        return response()->json(['document' => $document]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'category' => [$partial ? 'sometimes' : 'required', 'string', 'max:50'], 'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'file_url' => ['nullable', 'url', 'max:2048'], 'version' => ['nullable', 'string', 'max:20'],
            'status' => ['nullable', Rule::in(['draft', 'confirmed', 'submitted'])], 'created_by_employee_id' => ['nullable', 'exists:employees,id'],
            'created_by_ai_name' => ['nullable', 'string', 'max:255'], 'confirmed_by_employee_id' => ['nullable', 'exists:employees,id'],
            'confirmed_at' => ['nullable', 'date'], 'note' => ['nullable', 'string'],
        ]);
    }
}
