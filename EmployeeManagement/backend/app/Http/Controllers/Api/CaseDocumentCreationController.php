<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Http\Controllers\Controller;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\DocumentGenerationTemplate;
use App\Services\DocumentGenerationService;
use App\Services\DocumentPdfRenderer;
use App\Services\GeneratedDocumentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\Response;

class CaseDocumentCreationController extends Controller
{
    public function googleDrive(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, GeneratedDocumentStorageService $storage): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $version = $this->requestedVersion($request);
        // Preserve the existing 404 contract rather than turning missing instances into provider failures.
        $query = $caseDocument->generatedDocuments();
        if ($version !== null) {
            $query->where('version', $version);
        }
        abort_unless($query->exists(), 404);
        try {
            return response()->json(['drive' => $storage->save($caseFile, $caseDocument, $request->user()->id, $version)]);
        } catch (GeneratedDocumentDriveException $error) {
            return response()->json(['message' => $error->getMessage()], 503);
        } catch (ValidationException $error) {
            throw $error;
        } catch (\Throwable) {
            return response()->json(['message' => '文書を保存できませんでした。時間をおいて再試行してください。'], 500);
        }
    }

    public function pdf(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentPdfRenderer $renderer): Response
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $instance = $this->selectedInstance($request, $caseDocument, ['template.documentType']);
        $bytes = $renderer->render($instance);

        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $renderer->filename($instance, $caseFile->id), 'document-'.$caseDocument->id.'.pdf'),
        ]);
    }

    public function show(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $version = $this->requestedVersion($request);
        $instance = $version === null
            ? $caseDocument->generatedDocuments()->with(['template.documentType:id,code,name_ja', 'approvedBy:id,name'])->orderByDesc('version')->first()
            : $caseDocument->generatedDocuments()->with(['template.documentType:id,code,name_ja', 'approvedBy:id,name'])->where('version', $version)->firstOrFail();
        $template = $instance?->template ?? $documents->activeTemplate($caseDocument);

        if (! $template) {
            return response()->json(['supported' => false, 'template' => null, 'document' => null]);
        }

        return $this->stateResponse($caseDocument, $template, $instance, $instance?->draft_data ?? $documents->initialDraft($caseDocument, $template));
    }

    public function saveDraft(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $payload = $request->validate(['draft_data' => ['required', 'array']]);

        return DB::transaction(function () use ($request, $caseFile, $caseDocument, $documents, $payload) {
            [$document, $instance, $template] = $this->lockedContext($caseFile, $caseDocument, $documents);
            $this->assertEditable($instance);
            $draft = $documents->validateDraft($template, $payload['draft_data'], false);
            $actorId = $request->user()->id;
            if ($instance) {
                $instance->update(['workflow_status' => 'draft', 'draft_data' => $draft, 'updated_by' => $actorId]);
            } else {
                $instance = $document->generatedDocuments()->create([
                    'document_generation_template_id' => $template->id,
                    'version' => 1, 'workflow_status' => 'draft', 'draft_data' => $draft,
                    'created_by' => $actorId, 'updated_by' => $actorId,
                ]);
            }

            return $this->stateResponse($document, $template, $instance->fresh(['approvedBy:id,name']), $draft);
        });
    }

    public function review(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $payload = $request->validate(['draft_data' => ['required', 'array']]);

        return DB::transaction(function () use ($request, $caseFile, $caseDocument, $documents, $payload) {
            [$document, $instance, $template] = $this->lockedContext($caseFile, $caseDocument, $documents);
            $this->assertEditable($instance);
            $draft = $documents->validateDraft($template, $payload['draft_data'], true);
            $actorId = $request->user()->id;
            if ($instance) {
                $instance->update(['workflow_status' => 'review', 'draft_data' => $draft, 'updated_by' => $actorId]);
            } else {
                $instance = $document->generatedDocuments()->create([
                    'document_generation_template_id' => $template->id,
                    'version' => 1, 'workflow_status' => 'review', 'draft_data' => $draft,
                    'created_by' => $actorId, 'updated_by' => $actorId,
                ]);
            }

            return $this->stateResponse($document, $template, $instance->fresh(['approvedBy:id,name']), $draft);
        });
    }

    public function approve(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);

        return DB::transaction(function () use ($request, $caseFile, $caseDocument, $documents) {
            [, $instance, $template] = $this->lockedContext($caseFile, $caseDocument, $documents);
            if (! $instance || $instance->workflow_status !== 'review') {
                throw ValidationException::withMessages(['workflow_status' => '確認待ちの文書のみ承認できます。']);
            }
            $draft = $documents->validateDraft($template, $instance->draft_data, true);
            $instance->update([
                'workflow_status' => 'approved', 'approved_data' => $draft,
                'approved_at' => now(), 'approved_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
            ]);

            return $this->stateResponse($caseDocument, $template, $instance->fresh(['approvedBy:id,name']), $draft);
        });
    }

    public function revision(Request $request, CaseFile $caseFile, CaseDocument $caseDocument): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $this->assertGenerationAllowed($caseDocument);

        return DB::transaction(function () use ($request, $caseFile, $caseDocument) {
            CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $document = $caseFile->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
            $current = $document->generatedDocuments()->with('template.documentType:id,code,name_ja')->orderByDesc('version')->lockForUpdate()->firstOrFail();
            if ($current->workflow_status !== 'approved' || $current->approved_data === null) {
                throw ValidationException::withMessages(['workflow_status' => '承認済みの最新文書からのみ改訂版を作成できます。']);
            }

            $actorId = $request->user()->id;
            $revision = $document->generatedDocuments()->create([
                'document_generation_template_id' => $current->document_generation_template_id,
                'version' => $current->version + 1,
                'workflow_status' => 'draft',
                'draft_data' => $current->approved_data,
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

            return $this->stateResponse($document, $current->template, $revision->fresh(['approvedBy:id,name']), $revision->draft_data);
        });
    }

    public function approved(Request $request, CaseFile $caseFile, CaseDocument $caseDocument): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $instance = $this->selectedInstance($request, $caseDocument, ['template.documentType:id,code,name_ja', 'approvedBy:id,name']);
        abort_unless($instance && $instance->approved_data !== null, 404);

        return response()->json([
            'template' => $this->templatePayload($instance->template),
            'approved_document' => [
                'id' => $instance->id, 'version' => $instance->version, 'approved_data' => $instance->approved_data,
                'approved_at' => $instance->approved_at?->toISOString(),
                'approved_by' => $instance->approvedBy ? ['id' => $instance->approvedBy->id, 'name' => $instance->approvedBy->name] : null,
            ],
        ]);
    }

    private function assertBelongsToCase(CaseFile $caseFile, CaseDocument $caseDocument): void
    {
        abort_unless($caseDocument->case_file_id === $caseFile->id, 404);
    }

    private function assertEditable(?CaseGeneratedDocument $instance): void
    {
        if ($instance && ($instance->workflow_status === 'approved' || $instance->approved_data !== null)) {
            throw ValidationException::withMessages(['workflow_status' => '承認済みの文書は編集できません。']);
        }
    }

    private function assertGenerationAllowed(CaseDocument $caseDocument): void
    {
        $caseDocument->loadMissing('documentType:id,handling_type');
        abort_unless(
            $caseDocument->documentType?->handling_type === 'office_generated',
            404,
            'この資料は文書作成に対応していません。'
        );
    }

    /** @return array{CaseDocument, CaseGeneratedDocument|null, DocumentGenerationTemplate} */
    private function lockedContext(CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents): array
    {
        $document = $caseFile->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
        $this->assertGenerationAllowed($document);
        $instance = $document->generatedDocuments()->with('template.documentType:id,code,name_ja')->orderByDesc('version')->lockForUpdate()->first();
        $template = $instance?->template ?? $documents->activeTemplate($document);
        abort_unless($template, 404, 'この資料は文書作成に対応していません。');

        return [$document, $instance, $template];
    }

    /** @param array<string, string> $draft */
    private function stateResponse(CaseDocument $caseDocument, DocumentGenerationTemplate $template, ?CaseGeneratedDocument $instance, array $draft): JsonResponse
    {
        $versions = $caseDocument->generatedDocuments()
            ->with(['approvedBy:id,name', 'artifacts' => fn ($query) => $query->where('storage_provider', 'google_drive')->where('artifact_type', 'pdf')])
            ->orderByDesc('version')->get();
        $currentVersion = $versions->max('version');

        return response()->json([
            'supported' => true,
            'drive' => app(GeneratedDocumentStorageService::class)->state($instance, auth()->user()?->hasPermission('case.update') ?? false),
            'current_version' => $currentVersion,
            'versions' => $versions->map(function (CaseGeneratedDocument $version) use ($currentVersion) {
                $artifact = $version->artifacts->first();

                return [
                    'version' => $version->version,
                    'workflow_status' => $version->workflow_status,
                    'is_current' => $version->version === $currentVersion,
                    'approved_at' => $version->approved_at?->toISOString(),
                    'approved_by' => $version->approvedBy ? ['id' => $version->approvedBy->id, 'name' => $version->approvedBy->name] : null,
                    'drive_artifact' => $artifact ? ['url' => $artifact->external_url, 'filename' => $artifact->filename, 'uploaded_at' => $artifact->uploaded_at?->toISOString()] : null,
                ];
            })->values(),
            'template' => $this->templatePayload($template),
            'document' => [
                'id' => $instance?->id,
                'version' => $instance?->version ?? 1,
                'is_current' => $instance === null || $instance->version === $currentVersion,
                'workflow_status' => $instance?->workflow_status ?? 'not_created',
                'draft_data' => $draft,
                'approved_data' => $instance?->approved_data,
                'approved_at' => $instance?->approved_at?->toISOString(),
                'approved_by' => $instance?->approvedBy ? ['id' => $instance->approvedBy->id, 'name' => $instance->approvedBy->name] : null,
                'updated_at' => $instance?->updated_at?->toISOString(),
            ],
        ]);
    }

    /** @param array<int, string> $relations */
    private function selectedInstance(Request $request, CaseDocument $caseDocument, array $relations = []): CaseGeneratedDocument
    {
        $version = $this->requestedVersion($request);
        $query = $caseDocument->generatedDocuments()->with($relations);

        return $version === null
            ? $query->orderByDesc('version')->firstOrFail()
            : $query->where('version', $version)->firstOrFail();
    }

    private function requestedVersion(Request $request): ?int
    {
        $validated = $request->validate(['version' => ['nullable', 'integer', 'min:1']]);

        return array_key_exists('version', $validated) && $validated['version'] !== null
            ? (int) $validated['version']
            : null;
    }

    private function templatePayload(DocumentGenerationTemplate $template): array
    {
        return [
            'id' => $template->id,
            'document_type_id' => $template->document_type_id,
            'document_code' => $template->documentType->code,
            'name' => $template->documentType->name_ja,
            'version' => $template->version,
            'renderer_type' => $template->renderer_type,
            'format' => $template->format,
            'template_body' => $template->template_body,
            'field_schema' => $template->field_schema,
        ];
    }
}
