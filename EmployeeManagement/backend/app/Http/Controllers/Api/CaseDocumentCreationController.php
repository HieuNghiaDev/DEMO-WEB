<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Http\Controllers\Controller;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\DocumentGenerationTemplate;
use App\Services\C001DocumentWorkflowService;
use App\Services\C001WorkbookService;
use App\Services\CaseWorkspaceAuditService;
use App\Services\DocumentGenerationService;
use App\Services\DocumentPdfRenderer;
use App\Services\GeneratedDocumentStorageService;
use App\Services\GoogleDriveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\Response;

class CaseDocumentCreationController extends Controller
{
    public function previewC001(
        Request $request,
        CaseFile $caseFile,
        CaseDocument $caseDocument,
        C001DocumentWorkflowService $workflow
    ): Response {
        $this->assertBelongsToCase($caseFile, $caseDocument);

        try {
            $preview = $workflow->previewPdf(
                $caseFile,
                $caseDocument,
                $this->requestedVersion($request)
            );

            return response($preview['bytes'], 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => HeaderUtils::makeDisposition('inline', 'C-001_preview_v'.$preview['version'].'.pdf'),
                'X-C001-Preview-Source' => $preview['source'],
                'X-C001-Version' => (string) $preview['version'],
                'Cache-Control' => 'private, no-store, max-age=0',
            ]);
        } catch (GeneratedDocumentDriveException $error) {
            return response()->json(['message' => $error->getMessage()], 503);
        }
    }

    public function downloadC001(
        Request $request,
        CaseFile $caseFile,
        CaseDocument $caseDocument,
        C001DocumentWorkflowService $workflow
    ): Response {
        $this->assertBelongsToCase($caseFile, $caseDocument);

        try {
            $file = $workflow->download($caseFile, $caseDocument, $this->requestedVersion($request));

            return response($file['bytes'], 200, [
                'Content-Type' => GoogleDriveService::XLSX_MIME_TYPE,
                'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $file['filename'], 'C-001_v'.$file['version'].'.xlsx'),
            ]);
        } catch (GeneratedDocumentDriveException $error) {
            return response()->json(['message' => $error->getMessage()], 503);
        }
    }

    public function pdfC001(
        Request $request,
        CaseFile $caseFile,
        CaseDocument $caseDocument,
        C001DocumentWorkflowService $workflow
    ): Response {
        $this->assertBelongsToCase($caseFile, $caseDocument);

        try {
            $file = $workflow->downloadPdf($caseFile, $caseDocument, $this->requestedVersion($request));

            return response($file['bytes'], 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => HeaderUtils::makeDisposition('inline', $file['filename'], 'C-001_v'.$file['version'].'.pdf'),
                'Cache-Control' => 'private, no-store, max-age=0',
            ]);
        } catch (GeneratedDocumentDriveException $error) {
            return response()->json(['message' => $error->getMessage()], 503);
        }
    }

    public function syncC001(
        Request $request,
        CaseFile $caseFile,
        CaseDocument $caseDocument,
        C001DocumentWorkflowService $workflow,
        CaseWorkspaceAuditService $audit
    ): JsonResponse {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $payload = $request->validate([
            'success_fee_percentage' => ['required', 'numeric', 'gt:0', 'lte:100', 'decimal:0,2'],
        ]);

        try {
            $result = $workflow->sync($caseFile, $caseDocument, $request->user(), (string) $payload['success_fee_percentage']);
            if ($result['action'] !== 'existing') {
                $audit->record($caseFile, $request, 'C-001を作成', '委任契約書', [
                    'event' => 'c001.generated',
                    'document_id' => $caseDocument->id,
                    'generated_document_id' => $result['instance']->id,
                    'version' => $result['instance']->version,
                    'success_fee_percentage' => $result['instance']->success_fee_percentage,
                ]);
            }
            if ($result['fee_changed']) {
                $audit->record($caseFile, $request, 'C-001の報酬金を変更', null, [
                    'event' => 'c001.fee_percentage_changed',
                    'document_id' => $caseDocument->id,
                    'success_fee_percentage' => $result['instance']->success_fee_percentage,
                ]);
            }

            $caseDocument->refresh();

            return $this->stateResponse(
                $caseDocument,
                $result['instance']->template()->with('documentType:id,code,name_ja')->firstOrFail(),
                $result['instance'],
                $result['instance']->draft_data
            );
        } catch (GeneratedDocumentDriveException $error) {
            return response()->json(['message' => $error->getMessage()], 503);
        }
    }

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

    public function saveDraft(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents, C001DocumentWorkflowService $c001, CaseWorkspaceAuditService $audit): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $payload = $request->validate([
            'draft_data' => ['required', 'array'],
            'success_fee_percentage' => ['nullable', 'numeric', 'gt:0', 'lte:100', 'decimal:0,2'],
        ]);

        return DB::transaction(function () use ($request, $caseFile, $caseDocument, $documents, $c001, $audit, $payload) {
            [$document, $instance, $template] = $this->lockedContext($caseFile, $caseDocument, $documents);
            $this->assertEditable($instance);
            $isC001 = $c001->officialWorkflowEnabled($document);
            $draft = $isC001
                ? $this->validateC001Draft($document, $template, $documents, $payload['draft_data'])
                : $documents->validateDraft($template, $payload['draft_data'], false);
            $actorId = $request->user()->id;
            $previousFee = $instance?->success_fee_percentage;
            $fee = $isC001 ? $c001->normalizePercentage((string) ($payload['success_fee_percentage'] ?? $previousFee ?? 20)) : null;
            if ($isC001) {
                $instance = $this->persistC001WorkingDraft($document, $instance, $template, $draft, $fee, $actorId, 'draft');
            } elseif ($instance) {
                $instance->update(['workflow_status' => 'draft', 'draft_data' => $draft, 'success_fee_percentage' => $fee, 'updated_by' => $actorId]);
            } else {
                $instance = $document->generatedDocuments()->create([
                    'document_generation_template_id' => $template->id,
                    'version' => 1, 'workflow_status' => 'draft', 'draft_data' => $draft,
                    'success_fee_percentage' => $fee,
                    'created_by' => $actorId, 'updated_by' => $actorId,
                ]);
            }
            if ($isC001) {
                $audit->record($caseFile, $request, 'C-001の下書きを更新', '委任契約書', [
                    'event' => 'c001.draft_updated', 'document_id' => $document->id,
                    'generated_document_id' => $instance->id,
                ]);
                if ($previousFee !== null && $c001->normalizePercentage((string) $previousFee) !== $fee) {
                    $audit->record($caseFile, $request, 'C-001の報酬金を変更', null, [
                        'event' => 'c001.fee_percentage_changed', 'document_id' => $document->id,
                        'success_fee_percentage' => $fee,
                    ]);
                }
            }

            return $this->stateResponse($document, $template, $instance->fresh(['approvedBy:id,name', 'updatedBy:id,name']), $draft);
        });
    }

    public function review(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, DocumentGenerationService $documents, C001DocumentWorkflowService $c001, CaseWorkspaceAuditService $audit): JsonResponse
    {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $payload = $request->validate([
            'draft_data' => ['required', 'array'],
            'success_fee_percentage' => ['nullable', 'numeric', 'gt:0', 'lte:100', 'decimal:0,2'],
        ]);

        return DB::transaction(function () use ($request, $caseFile, $caseDocument, $documents, $c001, $audit, $payload) {
            [$document, $instance, $template] = $this->lockedContext($caseFile, $caseDocument, $documents);
            $this->assertEditable($instance);
            $isC001 = $c001->officialWorkflowEnabled($document);
            $draft = $isC001
                ? $this->validateC001Draft($document, $template, $documents, $payload['draft_data'])
                : $documents->validateDraft($template, $payload['draft_data'], true);
            $actorId = $request->user()->id;
            $previousFee = $instance?->success_fee_percentage;
            $fee = $isC001
                ? $c001->normalizePercentage((string) ($payload['success_fee_percentage'] ?? $instance?->success_fee_percentage ?? 20))
                : null;
            if ($isC001) {
                $instance = $this->persistC001WorkingDraft($document, $instance, $template, $draft, $fee, $actorId, 'review');
            } elseif ($instance) {
                $instance->update(['workflow_status' => 'review', 'draft_data' => $draft, 'success_fee_percentage' => $fee, 'updated_by' => $actorId]);
            } else {
                $instance = $document->generatedDocuments()->create([
                    'document_generation_template_id' => $template->id,
                    'version' => 1, 'workflow_status' => 'review', 'draft_data' => $draft,
                    'success_fee_percentage' => $fee,
                    'created_by' => $actorId, 'updated_by' => $actorId,
                ]);
            }
            if ($isC001) {
                $audit->record($caseFile, $request, 'C-001の下書きを更新', '委任契約書', [
                    'event' => 'c001.draft_updated', 'document_id' => $document->id,
                    'generated_document_id' => $instance->id, 'stage' => 'review',
                ]);
                if ($previousFee !== null && $c001->normalizePercentage((string) $previousFee) !== $fee) {
                    $audit->record($caseFile, $request, 'C-001の報酬金を変更', null, [
                        'event' => 'c001.fee_percentage_changed', 'document_id' => $document->id,
                        'success_fee_percentage' => $fee,
                    ]);
                }
            }

            return $this->stateResponse($document, $template, $instance->fresh(['approvedBy:id,name', 'updatedBy:id,name']), $draft);
        });
    }

    public function approve(
        Request $request,
        CaseFile $caseFile,
        CaseDocument $caseDocument,
        DocumentGenerationService $documents,
        C001DocumentWorkflowService $c001,
        CaseWorkspaceAuditService $audit
    ): JsonResponse {
        $this->assertBelongsToCase($caseFile, $caseDocument);

        if ($c001->officialWorkflowEnabled($caseDocument)) {
            $this->assertC001Approver($request);
            $instance = $c001->approve($caseFile, $caseDocument, $request->user());
            $audit->record($caseFile, $request, 'C-001を承認して完了', '委任契約書', [
                'event' => 'c001.approved',
                'document_id' => $caseDocument->id,
                'generated_document_id' => $instance->id,
                'approved_by' => $request->user()->id,
            ]);
            $caseDocument->refresh();

            return $this->stateResponse(
                $caseDocument,
                $instance->template()->with('documentType:id,code,name_ja')->firstOrFail(),
                $instance,
                $instance->draft_data
            );
        }

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

    public function rejectC001(
        Request $request,
        CaseFile $caseFile,
        CaseDocument $caseDocument,
        C001DocumentWorkflowService $workflow,
        CaseWorkspaceAuditService $audit
    ): JsonResponse {
        $this->assertBelongsToCase($caseFile, $caseDocument);
        $this->assertC001Approver($request);
        $instance = $workflow->reject($caseFile, $caseDocument, $request->user());
        $audit->record($caseFile, $request, 'C-001を差戻し', '委任契約書', [
            'event' => 'c001.rejected',
            'document_id' => $caseDocument->id,
            'generated_document_id' => $instance->id,
        ]);
        $caseDocument->refresh();

        return $this->stateResponse(
            $caseDocument,
            $instance->template()->with('documentType:id,code,name_ja')->firstOrFail(),
            $instance,
            $instance->draft_data
        );
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
                'success_fee_percentage' => $current->success_fee_percentage,
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

    /**
     * A C-001 row without the official XLSX/PDF pair is a working draft. When the
     * latest row is already finalized on Drive, start the next working version
     * instead of mutating the finalized row. The next number is only exposed as
     * official after final confirmation creates its artifact.
     *
     * @param  array<string, string>  $draft
     */
    private function persistC001WorkingDraft(
        CaseDocument $document,
        ?CaseGeneratedDocument $instance,
        DocumentGenerationTemplate $template,
        array $draft,
        string $fee,
        int $actorId,
        string $workflowStatus
    ): CaseGeneratedDocument {
        $hasWorkbook = $instance?->artifacts()
            ->where('artifact_type', C001DocumentWorkflowService::ARTIFACT_TYPE)
            ->where('storage_provider', 'google_drive')
            ->exists() ?? false;
        $hasPdf = $instance?->artifacts()
            ->where('artifact_type', C001DocumentWorkflowService::PDF_ARTIFACT_TYPE)
            ->where('storage_provider', 'google_drive')
            ->exists() ?? false;
        $isFinalized = $hasWorkbook && $hasPdf;

        if ($instance && $isFinalized) {
            return $document->generatedDocuments()->create([
                'document_generation_template_id' => $instance->document_generation_template_id,
                'version' => $instance->version + 1,
                'workflow_status' => $workflowStatus,
                'draft_data' => $draft,
                'success_fee_percentage' => $fee,
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);
        }

        if ($instance) {
            $instance->update([
                'workflow_status' => $workflowStatus,
                'draft_data' => $draft,
                'success_fee_percentage' => $fee,
                'updated_by' => $actorId,
            ]);

            return $instance;
        }

        return $document->generatedDocuments()->create([
            'document_generation_template_id' => $template->id,
            'version' => 1,
            'workflow_status' => $workflowStatus,
            'draft_data' => $draft,
            'success_fee_percentage' => $fee,
            'created_by' => $actorId,
            'updated_by' => $actorId,
        ]);
    }

    /** @param array<string, string> $draft */
    private function stateResponse(CaseDocument $caseDocument, DocumentGenerationTemplate $template, ?CaseGeneratedDocument $instance, array $draft): JsonResponse
    {
        $versions = $caseDocument->generatedDocuments()
            ->with(['approvedBy:id,name', 'artifacts' => fn ($query) => $query->where('storage_provider', 'google_drive')->whereIn('artifact_type', ['pdf', C001DocumentWorkflowService::ARTIFACT_TYPE])])
            ->orderByDesc('version')->get();
        $latestStoredVersion = $versions->max('version');

        $caseDocument->loadMissing('caseFile.client');
        $c001WorkbookArtifact = $instance?->artifacts()->where('storage_provider', 'google_drive')
            ->where('artifact_type', C001DocumentWorkflowService::ARTIFACT_TYPE)->first();
        $c001PdfArtifact = $instance?->artifacts()->where('storage_provider', 'google_drive')
            ->where('artifact_type', C001DocumentWorkflowService::PDF_ARTIFACT_TYPE)->first();
        $c001HasOfficialPair = $c001WorkbookArtifact && $c001PdfArtifact;
        $isC001 = $template->documentType->code === 'C-001';
        $usesOfficialC001Workflow = $isC001
            && app(C001DocumentWorkflowService::class)->officialWorkflowEnabled($caseDocument);
        $officialVersions = $usesOfficialC001Workflow
            ? $versions->filter(fn (CaseGeneratedDocument $version) => $version->artifacts->contains(
                fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::ARTIFACT_TYPE
                    && $artifact->storage_provider === 'google_drive'
            ) && $version->artifacts->contains(
                fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::PDF_ARTIFACT_TYPE
                    && $artifact->storage_provider === 'google_drive'
            ))->values()
            : $versions;
        $currentVersion = $usesOfficialC001Workflow ? $officialVersions->max('version') : $latestStoredVersion;
        $workingVersion = $usesOfficialC001Workflow
            ? $versions->first(fn (CaseGeneratedDocument $version) => in_array($version->workflow_status, ['draft', 'review'], true)
                && ! ($version->artifacts->contains(fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::ARTIFACT_TYPE
                    && $artifact->storage_provider === 'google_drive')
                    && $version->artifacts->contains(fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::PDF_ARTIFACT_TYPE
                        && $artifact->storage_provider === 'google_drive')))?->version
            : null;
        $instance?->loadMissing('updatedBy:id,name');

        return response()->json([
            'supported' => true,
            'permissions' => ['can_approve' => $isC001 ? $this->canApproveC001(auth()->user()) : (auth()->user()?->hasPermission('case.update') ?? false)],
            'c001' => $isC001 ? [
                'status' => $instance?->workflow_status === 'approved' && $c001HasOfficialPair
                    ? 'complete'
                    : ($caseDocument->review_status === 'returned' && $instance?->workflow_status === 'draft'
                        ? 'rejected'
                        : (in_array($instance?->workflow_status, ['draft', 'review'], true) && ! $c001HasOfficialPair
                            ? 'draft'
                            : ($c001HasOfficialPair ? 'pending_approval' : 'missing'))),
                'client_name' => $caseDocument->caseFile?->client?->name,
                'client_address' => $caseDocument->caseFile?->client?->address,
                'success_fee_percentage' => $instance?->success_fee_percentage !== null
                    ? rtrim(rtrim(number_format((float) $instance->success_fee_percentage, 2, '.', ''), '0'), '.')
                    : '20',
                'master_template_name' => trim((string) config('services.google_drive.c001_template_file_name')),
                'master_read_only' => true,
                'mapped_fields' => C001WorkbookService::MAPPED_FIELDS,
                'latest_version' => $currentVersion,
                'next_version' => $workingVersion ?? (($currentVersion ?? 0) + 1),
                'working_version' => $workingVersion,
                'artifact' => $c001PdfArtifact ? [
                    'external_file_id' => $c001PdfArtifact->external_file_id,
                    'url' => $c001PdfArtifact->external_url,
                    'filename' => $c001PdfArtifact->filename,
                    'generated_at' => $c001PdfArtifact->created_at?->toISOString(),
                    'last_synced_at' => $c001PdfArtifact->updated_at?->toISOString(),
                    'generated_by' => $c001PdfArtifact->uploadedBy?->name,
                ] : null,
                'pdf_artifact' => $c001PdfArtifact ? [
                    'external_file_id' => $c001PdfArtifact->external_file_id,
                    'url' => $c001PdfArtifact->external_url,
                    'filename' => $c001PdfArtifact->filename,
                ] : null,
                'workbook_artifact' => $c001WorkbookArtifact ? [
                    'external_file_id' => $c001WorkbookArtifact->external_file_id,
                    'url' => $c001WorkbookArtifact->external_url,
                    'filename' => $c001WorkbookArtifact->filename,
                ] : null,
                'draft_updated_at' => $instance?->updated_at?->toISOString(),
                'draft_updated_by' => $instance?->updatedBy ? ['id' => $instance->updatedBy->id, 'name' => $instance->updatedBy->name] : null,
            ] : null,
            'drive' => app(GeneratedDocumentStorageService::class)->state($instance, auth()->user()?->hasPermission('case.update') ?? false),
            'current_version' => $currentVersion,
            'versions' => $officialVersions->map(function (CaseGeneratedDocument $version) use ($currentVersion) {
                $artifact = $version->artifacts->firstWhere('artifact_type', C001DocumentWorkflowService::PDF_ARTIFACT_TYPE)
                    ?? $version->artifacts->firstWhere('artifact_type', C001DocumentWorkflowService::ARTIFACT_TYPE);

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
                'is_current' => $instance === null || $instance->version === $latestStoredVersion,
                'workflow_status' => $instance?->workflow_status ?? 'not_created',
                'draft_data' => $draft,
                'approved_data' => $instance?->approved_data,
                'approved_at' => $instance?->approved_at?->toISOString(),
                'approved_by' => $instance?->approvedBy ? ['id' => $instance->approvedBy->id, 'name' => $instance->approvedBy->name] : null,
                'updated_at' => $instance?->updated_at?->toISOString(),
            ],
        ]);
    }

    private function assertC001Approver(Request $request): void
    {
        abort_unless($this->canApproveC001($request->user()), 403, 'C-001を承認できるのは弁護士または管理者のみです。');
    }

    private function canApproveC001($user): bool
    {
        return $user?->hasAnyRole(['level_3', 'level_5']) ?? false;
    }

    /**
     * C-001 customer identity always comes from the case database. Only the two
     * source keys are accepted; configuration such as the fee is stored separately.
     *
     * @param  array<string, string>  $draft
     * @return array<string, string>
     */
    private function validateC001Draft(
        CaseDocument $caseDocument,
        DocumentGenerationTemplate $template,
        DocumentGenerationService $documents,
        array $draft
    ): array {
        $allowed = ['client_name', 'client_address'];
        $unknown = array_diff(array_keys($draft), $allowed);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys(
                array_map(fn ($key) => "draft_data.{$key}", $unknown),
                'この項目はC-001の作業ファイルに定義されていません。'
            ));
        }

        $initial = $documents->initialDraft($caseDocument, $template);

        return collect($allowed)->mapWithKeys(fn (string $field) => [
            $field => (string) ($initial[$field] ?? ''),
        ])->all();
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
