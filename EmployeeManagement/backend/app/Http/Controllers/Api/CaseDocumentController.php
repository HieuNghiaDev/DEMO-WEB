<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Services\CaseWorkspaceAuditService;

class CaseDocumentController extends Controller
{
    public function __construct(private readonly CaseWorkspaceAuditService $auditService)
    {
    }

    public function index(CaseFile $caseFile): JsonResponse
    {
        return response()->json(['documents' => $caseFile->documents()->latest()->get()]);
    }

    public function store(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $this->validated($request);
        $data['version'] = '1';
        $data['created_by_employee_id'] = $request->user()?->employee_id;
        $this->applyConfirmation($data, $request);
        $document = $caseFile->documents()->create($data);
        $this->auditService->record($caseFile, $request, '資料を追加', $document->title, ['document_id' => $document->id]);

        return response()->json(['document' => $document], 201);
    }

    public function update(Request $request, CaseFile $caseFile, CaseDocument $document): JsonResponse
    {
        abort_unless($document->case_file_id === $caseFile->id, 404);
        $data = $this->validated($request, true);
        $data['version'] = (string) ($this->versionNumber($document->version) + 1);
        $this->applyConfirmation($data, $request);
        $document->update($data);
        $this->auditService->record($caseFile, $request, '資料を更新', $document->title, ['document_id' => $document->id, 'status' => $document->status]);

        return response()->json(['document' => $document]);
    }

    public function destroy(Request $request, CaseFile $caseFile, CaseDocument $document): JsonResponse
    {
        abort_unless($document->case_file_id === $caseFile->id, 404);
        $document->delete();
        $this->auditService->record($caseFile, $request, '資料を削除', $document->title, ['document_id' => $document->id]);

        return response()->json(['message' => '資料を削除しました。']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'category' => [$partial ? 'sometimes' : 'required', 'string', 'max:50'],
            'requirement_level' => ['nullable', Rule::in(['required', 'conditional', 'optional'])],
            'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'file_url' => ['nullable', 'url', 'max:2048'],
            'status' => ['nullable', Rule::in(['not_requested', 'requested', 'waiting', 'received', 'reviewing', 'deficient', 'resubmission_requested', 'confirmed', 'submitted', 'not_required', 'draft'])],
            'due_at' => ['nullable', 'date'],
            'received_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    private function applyConfirmation(array &$data, Request $request): void
    {
        if (($data['status'] ?? null) === 'confirmed') {
            $data['confirmed_by_employee_id'] = $request->user()?->employee_id;
            $data['confirmed_at'] = now();
        } elseif (array_key_exists('status', $data)) {
            $data['confirmed_by_employee_id'] = null;
            $data['confirmed_at'] = null;
        }
    }

    private function versionNumber(?string $version): int
    {
        return preg_match('/^v?(\d+)$/i', (string) $version, $matches) === 1
            ? (int) $matches[1]
            : 1;
    }
}
