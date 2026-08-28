<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseCustomSection;
use App\Models\CaseFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CaseCustomSectionController extends Controller
{
    public function store(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $this->validated($request);
        $data['case_file_id'] = $caseFile->id;
        $data['created_by_employee_id'] = $request->user()?->employee_id;
        $data['sort_order'] = ((int) $caseFile->customSections()->max('sort_order')) + 1;

        $section = CaseCustomSection::query()->create($data);

        return response()->json(['custom_section' => $section], 201);
    }

    public function update(Request $request, CaseFile $caseFile, CaseCustomSection $customSection): JsonResponse
    {
        $this->belongsToCase($caseFile, $customSection);
        $customSection->update($this->validated($request));

        return response()->json(['custom_section' => $customSection]);
    }

    public function destroy(CaseFile $caseFile, CaseCustomSection $customSection): JsonResponse
    {
        $this->belongsToCase($caseFile, $customSection);
        $customSection->delete();

        return response()->json(['message' => 'カスタムセクションを削除しました。']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:80'],
            'content' => ['nullable', 'string', 'max:10000'],
        ]);
    }

    private function belongsToCase(CaseFile $caseFile, CaseCustomSection $customSection): void
    {
        abort_unless($customSection->case_file_id === $caseFile->id, 404);
    }
}
