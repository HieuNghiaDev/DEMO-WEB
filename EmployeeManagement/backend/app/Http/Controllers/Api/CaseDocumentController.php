<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use App\Services\CaseWorkspaceAuditService;

class CaseDocumentController extends Controller
{
    public function __construct(private readonly CaseWorkspaceAuditService $auditService)
    {
    }

    public function index(CaseFile $caseFile): JsonResponse
    {
        // Document route permissions do not establish access to their parent case.
        Gate::authorize('view', $caseFile);

        return response()->json(['documents' => $caseFile->documents()->latest()->get()]);
    }

    public function store(Request $request, CaseFile $caseFile): JsonResponse
    {
        Gate::authorize('view', $caseFile);

        $data = $this->validated($request);
        if (in_array($data['requirement_level'] ?? null, ['required', 'conditional'], true)
            || ($data['status'] ?? null) === 'not_required') {
            Gate::authorize('decideDocumentNecessity', $caseFile);
        }
        $data['version'] = '1';
        $data['created_by_employee_id'] = $request->user()?->employee_id;
        $this->applyConfirmation($data, $request);
        $document = $caseFile->documents()->create($data);
        $this->auditService->record($caseFile, $request, '資料を追加', $document->title, ['document_id' => $document->id]);

        return response()->json(['document' => $document], 201);
    }

    public function update(Request $request, CaseFile $caseFile, CaseDocument $document): JsonResponse
    {
        Gate::authorize('view', $caseFile);

        abort_unless($document->case_file_id === $caseFile->id, 404);
        $data = $this->validated($request, true);

        return $caseFile->getConnection()->transaction(function () use ($caseFile, $document, $data, $request) {
            $document = $caseFile->documents()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            if ((array_key_exists('requirement_level', $data) && $data['requirement_level'] !== $document->requirement_level)
                || (array_key_exists('status', $data) && ($data['status'] === 'not_required') !== ($document->status === 'not_required'))) {
                Gate::authorize('decideDocumentNecessity', $caseFile);
            }
            $data['version'] = (string) ($this->versionNumber($document->version) + 1);
            $this->applyConfirmation($data, $request);
            $document->update($data);
            $this->auditService->record($caseFile, $request, '資料を更新', $document->title, ['document_id' => $document->id, 'status' => $document->status]);

            return response()->json(['document' => $document]);
        });
    }

    public function destroy(Request $request, CaseFile $caseFile, CaseDocument $document): JsonResponse
    {
        Gate::authorize('view', $caseFile);

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
            $actor = $request->user();
            if (\App\Services\Administration\MainRoles::assigned($actor)) {
                abort_unless($actor->hasPermission('task.review'), 403);
            }
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
