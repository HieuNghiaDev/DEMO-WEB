<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CaseDocumentCollectionDetailResource;
use App\Http\Resources\CaseDocumentCollectionResource;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\DocumentType;
use App\Models\Employee;
use App\Models\ReceivedDocument;
use App\Services\CaseWorkspaceAuditService;
use App\Services\DocumentCollectionTaskService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class CaseDocumentCollectionController extends Controller
{
    private const RELATIONS = ['documentType:id,code,name_ja,description', 'purposes:id,code,name_ja,sort_order', 'assignedEmployee:id,full_name'];

    public function index(Request $request, CaseFile $caseFile): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['sometimes', 'string', 'max:255'],
            'purpose' => ['sometimes', 'string', 'max:30'],
            'source' => ['sometimes', 'string', 'max:255'],
            'assignee_id' => ['sometimes', 'integer', 'min:1'],
            ...$this->statusRules(),
            'overdue' => ['sometimes', Rule::in(['true', 'false', '1', '0'])],
            'preservation_priority' => ['sometimes', Rule::in(['true', 'false', '1', '0'])],
            'priority' => ['sometimes', Rule::in(CaseDocument::COLLECTION_PRIORITIES)],
            'deadline_from' => ['sometimes', 'date_format:Y-m-d'],
            'deadline_to' => ['sometimes', 'date_format:Y-m-d', ...($request->filled('deadline_from') ? ['after_or_equal:deadline_from'] : [])],
            'sort' => ['sometimes', Rule::in(['document_code', 'document_name', 'deadline', 'assignee', 'priority', 'updated_at'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
        ]);
        $now = now();
        $base = CaseDocument::query()->where('case_file_id', $caseFile->id);
        // Aggregates are case-wide and independent of the filtered/paginated list.
        $counts = (clone $base)->selectRaw("COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN necessity_status = 'undetermined' THEN 1 ELSE 0 END), 0) AS undetermined,
            COALESCE(SUM(CASE WHEN necessity_status = 'required' THEN 1 ELSE 0 END), 0) AS required_count,
            COALESCE(SUM(CASE WHEN necessity_status = 'not_required' THEN 1 ELSE 0 END), 0) AS not_required,
            COALESCE(SUM(CASE WHEN response_deadline < ? AND collection_status NOT IN ('received', 'closed') THEN 1 ELSE 0 END), 0) AS overdue,
            COALESCE(SUM(CASE WHEN preservation_priority = 1 THEN 1 ELSE 0 END), 0) AS preservation_count,
            COALESCE(SUM(CASE WHEN collection_result IS NOT NULL THEN 1 ELSE 0 END), 0) AS exception_count", [$now])->first();

        $query = $this->filter($base, $filters, $now);
        $this->sort($query, $filters);
        $page = $query->with(self::RELATIONS)->withCount([
            'receivedDocuments' => fn ($q) => $q->where('received_documents.case_file_id', $caseFile->id),
        ])->paginate($filters['per_page'] ?? 25);

        return response()->json([
            'documents' => CaseDocumentCollectionResource::collection($page->getCollection())->resolve($request),
            'pagination' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(),
                'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'summary' => ['total' => (int) $counts->total,
                'necessity' => ['undetermined' => (int) $counts->undetermined, 'required' => (int) $counts->required_count,
                    'not_required' => (int) $counts->not_required],
                'overdue' => (int) $counts->overdue, 'preservation_priority' => (int) $counts->preservation_count,
                'collection_result_count' => (int) $counts->exception_count, 'filtered_count' => $page->total()],
        ]);
    }

    public function show(Request $request, CaseFile $caseFile, CaseDocument $caseDocument): JsonResponse
    {
        abort_unless($caseDocument->case_file_id === $caseFile->id, 404);

        return $this->detail($request, $caseDocument);
    }

    public function update(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, CaseWorkspaceAuditService $audit, DocumentCollectionTaskService $documentCollectionTasks): JsonResponse
    {
        abort_unless($caseDocument->case_file_id === $caseFile->id, 404);

        return $caseFile->getConnection()->transaction(function () use ($request, $caseFile, $caseDocument, $audit, $documentCollectionTasks) {
            // Same lock order as checklist generation; validate against the latest stored state.
            $case = CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $document = $case->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
            $data = $this->validatedPatch($request, $document);
            abort_unless(
                ! array_key_exists('review_status', $data) || $request->user()?->hasAnyRole(['level_4', 'level_5']),
                403,
                '資料の確認状態を変更できるのはレベル4またはレベル5のユーザーのみです。'
            );
            if (isset($data['necessity_status']) && $data['necessity_status'] !== $document->necessity_status) {
                $decided = $data['necessity_status'] !== 'undetermined';
                $actor = $request->user()->employee;
                abort_if($decided && ! $actor, 403, '判断を記録するには社員情報が必要です。');
                $data['necessity_decided_by_employee_id'] = $decided ? $actor->id : null;
                $data['necessity_decided_at'] = $decided ? now() : null;
                if (! $decided) {
                    $data['necessity_reason'] = null;
                }
            }
            $before = $document->getRawOriginal();
            $wasPreparationConfirmed = $document->requested_at !== null;
            $assigneeChanged = array_key_exists('assigned_employee_id', $data)
                && (int) $data['assigned_employee_id'] !== (int) $document->assigned_employee_id;
            $document->fill($data);
            $changes = [];
            foreach ($document->getDirty() as $field => $value) {
                $changes[$field] = ['before' => $before[$field] ?? null, 'after' => $value];
            }
            if ($changes !== []) {
                $document->save();
                $task = null;
                if ($document->requested_at && $document->assigned_employee_id && (! $wasPreparationConfirmed || $assigneeChanged)) {
                    $task = $documentCollectionTasks->synchronize($document, $request);
                } elseif ($assigneeChanged && ! $document->assigned_employee_id) {
                    $documentCollectionTasks->cancelOpenTask($document);
                }
                $audit->record($case, $request, '資料収集項目を更新', $document->title, [
                    'event' => 'document_collection.updated', 'document_id' => $document->id,
                    'actor_user_id' => $request->user()->id, 'changes' => $changes,
                    'employee_task_id' => $task?->id,
                ]);
            }

            return $this->detail($request, $document);
        });
    }

    public function bulkUpdateNecessity(Request $request, CaseFile $caseFile, CaseWorkspaceAuditService $audit): JsonResponse
    {
        $rules = [
            'case_document_ids' => ['required', 'array', 'min:1', 'max:100'],
            'case_document_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            'necessity_status' => ['required', Rule::in(CaseDocument::NECESSITY_STATUSES)],
            'necessity_reason' => ['nullable', 'string', 'max:5000'],
        ];
        $unknown = array_diff(array_keys($request->all()), array_keys($rules));
        if ($unknown) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'この項目は変更できません。'));
        }
        $data = $request->validate($rules);

        if ($data['necessity_status'] === 'not_required'
            && preg_match('/[^\s\p{Z}]/u', (string) ($data['necessity_reason'] ?? '')) !== 1) {
            throw ValidationException::withMessages(['necessity_reason' => '不要と判断した理由を入力してください。']);
        }

        return $caseFile->getConnection()->transaction(function () use ($request, $caseFile, $audit, $data) {
            $case = CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $ids = array_values($data['case_document_ids']);
            $documents = $case->documents()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();

            if ($documents->count() !== count($ids)) {
                throw ValidationException::withMessages(['case_document_ids' => 'この案件に属さない資料が含まれています。']);
            }

            $status = $data['necessity_status'];
            $actor = null;
            if ($status !== 'undetermined') {
                $actor = $request->user()?->employee;
                abort_if(! $actor, 403, '判断を記録するには社員情報が必要です。');
            }

            $updatedCount = 0;
            foreach ($documents as $document) {
                $before = $document->getRawOriginal();
                $attributes = ['necessity_status' => $status];
                if ($status === 'not_required') {
                    $attributes['necessity_reason'] = $data['necessity_reason'];
                }
                if ($status === 'undetermined') {
                    $attributes['necessity_reason'] = null;
                }
                if ($status !== $document->necessity_status) {
                    $attributes['necessity_decided_by_employee_id'] = $actor?->id;
                    $attributes['necessity_decided_at'] = $actor ? now() : null;
                }

                $document->fill($attributes);
                $changes = [];
                foreach ($document->getDirty() as $field => $value) {
                    $changes[$field] = ['before' => $before[$field] ?? null, 'after' => $value];
                }
                if ($changes === []) {
                    continue;
                }

                $document->save();
                $audit->record($case, $request, '資料収集項目を更新', $document->title, [
                    'event' => 'document_collection.updated',
                    'document_id' => $document->id,
                    'actor_user_id' => $request->user()->id,
                    'changes' => $changes,
                    'bulk_necessity' => true,
                ]);
                $updatedCount++;
            }

            return response()->json([
                'updated_count' => $updatedCount,
                'selected_count' => count($ids),
                'necessity_status' => $status,
            ]);
        });
    }

    public function storeReceivedDocument(Request $request, CaseFile $caseFile, CaseDocument $caseDocument, CaseWorkspaceAuditService $audit): JsonResponse
    {
        abort_unless($caseDocument->case_file_id === $caseFile->id, 404);

        $data = $request->validate([
            'storage_type' => ['required', Rule::in(ReceivedDocument::STORAGE_TYPES)],
            'title' => ['required', 'string', 'max:255'],
            'file' => ['nullable', 'required_if:storage_type,upload', 'file', 'max:20480'],
            'external_url' => ['nullable', 'required_if:storage_type,external_link,google_drive', 'string', 'max:2048', function (string $attribute, mixed $value, \Closure $fail) use ($request): void {
                if (in_array($request->input('storage_type'), ['external_link', 'google_drive'], true)
                    && (! filter_var($value, FILTER_VALIDATE_URL)
                    || ! in_array(strtolower((string) parse_url($value, PHP_URL_SCHEME)), ['http', 'https'], true))) {
                    $fail('有効なhttpまたはhttpsのURLを入力してください。');
                }
            }],
            'received_at' => ['nullable', 'date'],
            'original_or_copy' => ['nullable', Rule::in(ReceivedDocument::ORIGINAL_OR_COPY_VALUES)],
            'return_required' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $storedPath = null;

        try {
            return $caseFile->getConnection()->transaction(function () use ($request, $caseFile, $caseDocument, $audit, $data, &$storedPath) {
                $case = CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
                $document = $case->documents()->whereKey($caseDocument->id)->lockForUpdate()->firstOrFail();
                $attributes = [
                    'case_file_id' => $case->id,
                    'document_type_id' => $document->document_type_id,
                    'title' => $data['title'],
                    'storage_type' => $data['storage_type'],
                    'received_at' => isset($data['received_at']) ? Carbon::parse($data['received_at']) : now(),
                    'original_or_copy' => $data['original_or_copy'] ?? null,
                    'return_required' => $data['return_required'] ?? false,
                    'registered_by_employee_id' => $request->user()?->employee_id,
                    'notes' => $data['notes'] ?? null,
                ];

                if ($data['storage_type'] === 'upload') {
                    $upload = $request->file('file');
                    $storedPath = Storage::disk('local')->putFile("case-received-documents/{$case->id}", $upload);
                    abort_unless($storedPath !== false, 500, '受領文書の保存に失敗しました。');
                    $attributes['storage_path'] = $storedPath;
                    $attributes['original_filename'] = $upload->getClientOriginalName();
                } else {
                    $attributes['external_url'] = $data['external_url'];
                }

                $received = ReceivedDocument::create($attributes);
                $document->receivedDocuments()->attach($received->id, ['relationship_type' => 'received']);
                $reviewReset = $document->review_status === 'reviewed';
                if ($reviewReset) {
                    $document->update(['review_status' => 'unreviewed']);
                }
                $audit->record($case, $request, '受領文書を登録', $received->title, [
                    'event' => 'document_collection.received_document_registered',
                    'document_id' => $document->id,
                    'received_document_id' => $received->id,
                    'storage_type' => $received->storage_type,
                    'review_reset' => $reviewReset,
                ]);

                return $this->detail($request, $document)->setStatusCode(201);
            });
        } catch (Throwable $exception) {
            if ($storedPath) {
                Storage::disk('local')->delete($storedPath);
            }

            throw $exception;
        }
    }

    public function downloadReceivedDocument(CaseFile $caseFile, CaseDocument $caseDocument, ReceivedDocument $receivedDocument)
    {
        abort_unless($caseDocument->case_file_id === $caseFile->id, 404);
        abort_unless($receivedDocument->case_file_id === $caseFile->id, 404);
        abort_unless($caseDocument->receivedDocuments()->whereKey($receivedDocument->id)->exists(), 404);
        abort_unless($receivedDocument->storage_type === 'upload' && $receivedDocument->storage_path, 404);
        abort_unless(Storage::disk('local')->exists($receivedDocument->storage_path), 404);

        return Storage::disk('local')->download($receivedDocument->storage_path, $receivedDocument->original_filename ?: $receivedDocument->title);
    }

    private function detail(Request $request, CaseDocument $document): JsonResponse
    {
        // A corrupt cross-case pivot must not leak file metadata or even its count.
        $files = fn ($q) => $q->where('received_documents.case_file_id', $document->case_file_id);
        $document->load([...self::RELATIONS, 'necessityDecidedBy:id,full_name',
            'receivedDocuments' => fn ($q) => $files($q)->orderBy('received_documents.id'),
            'receivedDocuments.registeredByEmployee:id,full_name'])
            ->loadCount(['receivedDocuments' => $files]);

        return response()->json(['document' => (new CaseDocumentCollectionDetailResource($document))->resolve($request)]);
    }

    private function statusRules(): array
    {
        return [
            'necessity_status' => ['sometimes', Rule::in(CaseDocument::NECESSITY_STATUSES)],
            'collection_status' => ['sometimes', Rule::in(CaseDocument::COLLECTION_STATUSES)],
            'collection_result' => ['sometimes', 'nullable', Rule::in(CaseDocument::COLLECTION_RESULTS)],
            'fulfillment_status' => ['sometimes', Rule::in(CaseDocument::FULFILLMENT_STATUSES)],
            'review_status' => ['sometimes', Rule::in(CaseDocument::REVIEW_STATUSES)],
        ];
    }

    private function validatedPatch(Request $request, CaseDocument $document): array
    {
        $rules = [
            ...$this->statusRules(),
            'target_person' => ['sometimes', 'nullable', 'string', 'max:255'],
            'collection_source' => ['sometimes', 'nullable', 'string', 'max:255'],
            'collection_method' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'target_scope' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'target_period_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'target_period_to' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'assigned_employee_id' => ['sometimes', 'nullable', 'integer', Rule::exists('employees', 'id')->whereNull('deleted_at')],
            'requested_at' => ['sometimes', 'nullable', 'date'],
            'response_deadline' => ['sometimes', 'nullable', 'date'],
            'collection_priority' => ['sometimes', Rule::in(CaseDocument::COLLECTION_PRIORITIES)],
            'preservation_priority' => ['sometimes', 'boolean'],
            'preservation_reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'necessity_reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
        // Reject all non-contract fields, including provenance and client-supplied actor/time.
        $unknown = array_diff(array_keys($request->all()), array_keys($rules));
        if ($unknown) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'この項目は変更できません。'));
        }
        $data = $request->validate($rules);
        $from = array_key_exists('target_period_from', $data) ? $data['target_period_from'] : $document->target_period_from?->toDateString();
        $to = array_key_exists('target_period_to', $data) ? $data['target_period_to'] : $document->target_period_to?->toDateString();
        if ($from !== null && $to !== null && $to < $from) {
            throw ValidationException::withMessages(['target_period_to' => '終了日は開始日以降にしてください。']);
        }
        if (array_key_exists('necessity_status', $data) || array_key_exists('necessity_reason', $data)) {
            $reason = array_key_exists('necessity_reason', $data) ? $data['necessity_reason'] : $document->necessity_reason;
            if (($data['necessity_status'] ?? $document->necessity_status) === 'not_required'
                && preg_match('/[^\s\p{Z}]/u', (string) $reason) !== 1) {
                throw ValidationException::withMessages(['necessity_reason' => '不要と判断した理由を入力してください。']);
            }
        }
        foreach (['requested_at', 'response_deadline'] as $field) {
            if (isset($data[$field])) {
                $data[$field] = Carbon::parse($data[$field], config('app.timezone'))->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s');
            }
        }

        return $data;
    }

    private function filter(Builder $query, array $filters, Carbon $now): Builder
    {
        if (isset($filters['search'])) {
            // Escape LIKE wildcards so search text is literal; LOWER is portable to SQLite/MySQL.
            $term = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($filters['search'])).'%';
            $query->where(fn ($q) => $q->whereHas('documentType', fn ($type) => $type
                ->whereRaw("LOWER(code) LIKE ? ESCAPE '!'", [$term])
                ->orWhereRaw("LOWER(name_ja) LIKE ? ESCAPE '!'", [$term]))
                ->orWhereRaw("LOWER(title) LIKE ? ESCAPE '!'", [$term]));
        }
        if (isset($filters['purpose'])) {
            $query->whereHas('purposes', fn ($q) => $q->where('code', $filters['purpose']));
        }
        if (isset($filters['source'])) {
            $query->where('collection_source', $filters['source']);
        }
        foreach (['necessity_status', 'collection_status', 'collection_result', 'fulfillment_status', 'review_status'] as $field) {
            if (array_key_exists($field, $filters)) {
                $query->where($field, $filters[$field]);
            }
        }
        foreach (['assignee_id' => 'assigned_employee_id', 'priority' => 'collection_priority'] as $filter => $column) {
            if (isset($filters[$filter])) {
                $query->where($column, $filters[$filter]);
            }
        }
        if (isset($filters['preservation_priority'])) {
            $query->where('preservation_priority', filter_var($filters['preservation_priority'], FILTER_VALIDATE_BOOLEAN));
        }
        foreach (['deadline_from' => '>=', 'deadline_to' => '<='] as $field => $operator) {
            if (isset($filters[$field])) {
                $query->whereDate('response_deadline', $operator, $filters[$field]);
            }
        }
        if (isset($filters['overdue'])) {
            if (filter_var($filters['overdue'], FILTER_VALIDATE_BOOLEAN)) {
                $query->where('response_deadline', '<', $now)->whereNotIn('collection_status', ['received', 'closed']);
            } else {
                $query->where(fn ($q) => $q->whereNull('response_deadline')->orWhere('response_deadline', '>=', $now)
                    ->orWhereIn('collection_status', ['received', 'closed']));
            }
        }

        return $query;
    }

    private function sort(Builder $query, array $filters): void
    {
        $query->select('case_documents.*');
        $sort = $filters['sort'] ?? null;
        if ($sort === null) {
            $query->orderBy('sort_order')->orderBy('id');

            return;
        }
        if (in_array($sort, ['document_code', 'document_name'], true)) {
            $query->addSelect(['collection_sort' => DocumentType::select($sort === 'document_code' ? 'code' : 'name_ja')
                ->whereColumn('document_types.id', 'case_documents.document_type_id')]);
        } elseif ($sort === 'assignee') {
            $query->addSelect(['collection_sort' => Employee::select('full_name')->whereColumn('employees.id', 'case_documents.assigned_employee_id')]);
        } elseif ($sort === 'priority') {
            $query->selectRaw("CASE collection_priority WHEN 'low' THEN 0 WHEN 'normal' THEN 1 WHEN 'high' THEN 2 WHEN 'critical' THEN 3 END AS collection_sort");
        } else {
            $column = $sort === 'deadline' ? 'response_deadline' : 'updated_at';
            $query->addSelect("{$column} as collection_sort");
        }
        $query->orderByRaw('collection_sort IS NULL')->orderBy('collection_sort', $filters['direction'] ?? 'asc')->orderBy('id');
    }
}
