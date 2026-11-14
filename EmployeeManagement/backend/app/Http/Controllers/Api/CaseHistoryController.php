<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseActivity;
use App\Models\CaseFile;
use App\Models\CaseMeetingLog;
use App\Models\CaseTask;
use App\Models\Employee;
use App\Services\CaseHistoryAttachments;
use App\Services\CaseHistoryUploadStaging;
use App\Services\CaseTaskService;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CaseHistoryController extends Controller
{
    public const TYPES = ['phone', 'email', 'chat', 'online_meeting', 'office_meeting', 'visit', 'postal_mail', 'other'];

    public function __construct(private readonly CaseWorkspaceAuditService $audit) {}

    private const AUDIT_KEYS = ['document_id', 'case_document_id', 'task_id', 'party_id', 'deadline_id', 'document_file_event', 'actor_user_id'];

    /** Untagged manual notes are legacy business records, not asserted to be verified audit. */
    private function system(Builder $query): Builder
    {
        return $query->where(fn ($q) => $q->where('metadata->history_kind', 'system')
            ->orWhereNotNull('metadata->event')
            ->orWhere(function ($legacy) {
                $legacy->where('activity_type', 'note')->where('channel', 'internal')->whereNull('metadata->communication')
                    ->where(function ($keys) {
                        foreach (self::AUDIT_KEYS as $key) {
                            $keys->orWhereNotNull('metadata->'.$key);
                        }
                    });
            }));
    }

    private function business(Builder $query): Builder
    {
        return $query->whereNull('metadata->event')
            ->where(fn ($q) => $q->whereNull('metadata->history_kind')->orWhere('metadata->history_kind', '!=', 'system'))
            ->where(function ($q) {
                $q->whereNotNull('metadata->communication')->orWhere('activity_type', '!=', 'note')->orWhereNull('channel')->orWhere('channel', '!=', 'internal')
                    ->orWhere(function ($untagged) {
                        foreach (self::AUDIT_KEYS as $key) {
                            $untagged->whereNull('metadata->'.$key);
                        }
                    });
            });
    }

    public function index(Request $request, CaseFile $caseFile): JsonResponse
    {
        $filters = $request->validate([
            'kind' => ['nullable', Rule::in(['system', 'communication'])],
            'type' => ['nullable', Rule::in(self::TYPES)],
            'actor_id' => ['nullable', 'integer', 'min:1'],
            'from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'between:1,50'],
        ]);
        $base = $caseFile->activities()->visibleTaskData($request->user())->reorder()->getQuery();
        $legacy = $caseFile->meetingLogs()->reorder()->getQuery();
        foreach ([$base, $legacy] as $query) {
            if (! empty($filters['actor_id'])) {
                $query->where('created_by_employee_id', $filters['actor_id']);
            }
            $column = $query === $base ? 'occurred_at' : 'meeting_date';
            if (! empty($filters['from'])) {
                $query->whereDate($column, '>=', $filters['from']);
            }
            if (! empty($filters['to'])) {
                $query->where($column, '<', Carbon::parse($filters['to'])->addDay()->toDateString());
            }
            if (! empty($filters['search'])) {
                $term = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $filters['search']).'%';
                $query->where(function ($q) use ($term, $query, $base) {
                    $q->whereRaw("content LIKE ? ESCAPE '!'", [$term]);
                    if ($query === $base) {
                        $q->orWhereRaw("title LIKE ? ESCAPE '!'", [$term]);
                    }
                });
            }
        }
        $system = $this->system(clone $base);
        $business = $this->business(clone $base);
        if (! empty($filters['type'])) {
            $system->whereRaw('1 = 0');
        }
        if (! empty($filters['type'])) {
            $type = $filters['type'];
            $oldChannel = ['chat' => 'line', 'office_meeting' => 'meeting', 'phone' => 'phone', 'email' => 'email', 'other' => 'other'][$type] ?? null;
            $business->where(fn ($q) => $q->where('metadata->communication->communication_type', $type)
                ->when($oldChannel, fn ($q) => $q->orWhere(fn ($old) => $old->whereNull('metadata->communication')->where('channel', $oldChannel))));
            $legacyType = ['office_meeting' => 'meeting', 'phone' => 'phone', 'email' => 'email', 'other' => 'internal_note'][$type] ?? '__none';
            $legacy->where('interaction_type', $legacyType);
        }
        // Kind tabs count all matching authorized records, never just the current page.
        $counts = ['system' => (clone $system)->count(), 'communication' => (clone $business)->count() + (clone $legacy)->count()];
        $counts['all'] = $counts['system'] + $counts['communication'];
        if (($filters['kind'] ?? null) === 'communication') {
            $system->whereRaw('1 = 0');
        }
        if (($filters['kind'] ?? null) === 'system') {
            $business->whereRaw('1 = 0');
            $legacy->whereRaw('1 = 0');
        }
        $union = $system->select('id', 'occurred_at')->selectRaw("'activity' as source, 'system' as kind")
            ->unionAll($business->select('id', 'occurred_at')->selectRaw("'activity' as source, 'communication' as kind"))
            ->unionAll($legacy->select('id', 'meeting_date as occurred_at')->selectRaw("'meeting' as source, 'communication' as kind"));
        $perPage = $filters['per_page'] ?? 15;
        $total = $counts[$filters['kind'] ?? 'all'];
        $pageNumber = min($filters['page'] ?? 1, max(1, (int) ceil($total / $perPage)));
        $page = DB::query()->fromSub($union, 'timeline')->orderByDesc('occurred_at')->orderByDesc('id')->orderByDesc('source')
            ->paginate($perPage, ['*'], 'page', $pageNumber, $total);
        $activityIds = collect($page->items())->where('source', 'activity')->pluck('id');
        $meetingIds = collect($page->items())->where('source', 'meeting')->pluck('id');
        $activities = $caseFile->activities()->whereIn('id', $activityIds)->with('createdByEmployee:id,full_name')->get()->keyBy('id');
        $meetings = $caseFile->meetingLogs()->whereIn('id', $meetingIds)->with('createdByEmployee:id,full_name')->get()->keyBy('id');
        $entries = collect($page->items())->map(fn ($row) => $row->source === 'activity'
            ? $this->entry($activities[$row->id], $request, $row->kind)
            : $this->legacyEntry($meetings[$row->id]));

        return response()->json(['entries' => $entries, 'counts' => $counts, 'pagination' => [
            'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
            'per_page' => $page->perPage(),
            'from' => $page->firstItem(), 'to' => $page->lastItem(),
        ], 'permissions' => $this->permissions($request)]);
    }

    public function options(Request $request, CaseFile $caseFile): JsonResponse
    {
        $people = [['type' => 'client', 'id' => $caseFile->client_id, 'name' => $caseFile->client->name]];
        foreach ($caseFile->parties()->get(['id', 'name']) as $party) {
            $people[] = ['type' => 'party', 'id' => $party->id, 'name' => $party->name];
        }
        foreach (Employee::where('status', 'active')->orderBy('full_name')->get(['id', 'full_name']) as $employee) {
            $people[] = ['type' => 'employee', 'id' => $employee->id, 'name' => $employee->full_name];
        }

        $permissions = $this->permissions($request);
        $permissions['can_upload_attachments'] = $permissions['can_edit_communication'] && CaseHistoryAttachments::supports($caseFile);

        return response()->json(['people' => $people, 'permissions' => $permissions]);
    }

    public function store(Request $request, CaseFile $caseFile, CaseHistoryAttachments $files): JsonResponse
    {
        $communication = $this->validated($request, $caseFile);
        $activity = $files->save($request, $caseFile, function (array $attachments) use ($request, $caseFile, $communication) {
            $activity = $caseFile->activities()->create([
                'activity_type' => 'communication', 'channel' => $this->channel($communication['communication_type']),
                'title' => $communication['subject'], 'content' => $communication['summary'], 'occurred_at' => $communication['started_at'],
                'created_by_employee_id' => $request->user()->employee_id,
                'metadata' => ['history_kind' => 'communication', 'communication' => $communication,
                    'history_attachments' => $attachments,
                    'created_by_user_id' => $request->user()->id, 'updated_by_user_id' => $request->user()->id],
            ]);
            $this->audit->record($caseFile, $request, '連絡・面談履歴を追加', $activity->title, [
                'event' => 'communication.created', 'communication_id' => $activity->id, 'attachment_count' => count($attachments),
            ]);

            return $activity;
        });

        return response()->json(['entry' => $this->entry($activity->load('createdByEmployee'), $request, 'communication')], 201);
    }

    public function show(Request $request, CaseFile $caseFile, CaseActivity $communication): JsonResponse
    {
        $this->ensureCommunication($caseFile, $communication);

        return response()->json(['entry' => $this->entry($communication->load('createdByEmployee'), $request, 'communication')]);
    }

    public function update(Request $request, CaseFile $caseFile, CaseActivity $communication, CaseHistoryAttachments $files): JsonResponse
    {
        $this->ensureCommunication($caseFile, $communication);
        $data = $this->validated($request, $caseFile);
        $files->save($request, $caseFile, function (array $attachments) use ($request, $caseFile, $communication, $data) {
            $activity = $caseFile->activities()->whereKey($communication->id)->lockForUpdate()->firstOrFail();
            $this->ensureCommunication($caseFile, $activity);
            $before = $activity->metadata['communication'];
            $existing = $activity->metadata['history_attachments'] ?? [];
            $data['linked_task_id'] = $before['linked_task_id'] ?? null;
            $changes = [];
            foreach ($data as $key => $value) {
                if (($before[$key] ?? null) !== $value) {
                    $changes[$key] = ['before' => $before[$key] ?? null, 'after' => $value];
                }
            }
            if (! $changes && ! $attachments) {
                return;
            }
            if ($attachments) {
                $afterCount = count($existing) + count($attachments);
                if ($afterCount > 10) {
                    throw ValidationException::withMessages(['attachments' => '1件の履歴に添付できるファイルは10件までです。']);
                }
                $changes['attachment_count'] = ['before' => count($existing), 'after' => $afterCount];
            }
            $activity->update(['title' => $data['subject'], 'content' => $data['summary'], 'occurred_at' => $data['started_at'],
                'channel' => $this->channel($data['communication_type']),
                'metadata' => [...$activity->metadata, 'communication' => $data, 'history_attachments' => [...$existing, ...$attachments],
                    'updated_by_user_id' => $request->user()->id]]);
            $this->audit->record($caseFile, $request, '連絡・面談履歴を更新', $activity->title, ['event' => 'communication.updated', 'communication_id' => $activity->id, 'changes' => $changes]);
        }, $communication->id);

        return response()->json(['entry' => $this->entry($communication->fresh()->load('createdByEmployee'), $request, 'communication')]);
    }

    public function startAttachmentUpload(Request $request, CaseFile $caseFile, CaseHistoryUploadStaging $staging): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'], 'size' => ['required', 'integer', 'min:1', 'max:262144000'],
            'communication_id' => ['nullable', 'integer', 'min:1'],
        ]);
        $communicationId = isset($data['communication_id']) ? (int) $data['communication_id'] : null;
        if ($communicationId !== null) {
            $this->ensureCommunication($caseFile, $caseFile->activities()->findOrFail($communicationId));
        }
        $id = $staging->start($caseFile, $request->user(), $communicationId, $data['name'], (int) $data['size']);

        return response()->json(['upload_id' => $id], 201);
    }

    public function appendAttachmentChunk(Request $request, CaseFile $caseFile, string $upload, CaseHistoryUploadStaging $staging): JsonResponse
    {
        $data = $request->validate([
            'offset' => ['required', 'integer', 'min:0', 'max:262144000'],
            'chunk' => ['required', 'file', 'max:'.CaseHistoryUploadStaging::CHUNK_KIB],
        ]);
        $next = $staging->append($caseFile, $request->user(), $upload, (int) $data['offset'], $data['chunk']);

        return response()->json(['next_offset' => $next]);
    }

    public function discardAttachmentUpload(Request $request, CaseFile $caseFile, string $upload, CaseHistoryUploadStaging $staging): JsonResponse
    {
        $staging->discard($caseFile, $request->user(), $upload);

        return response()->json(null, 204);
    }

    public function attachment(CaseFile $caseFile, CaseActivity $communication, string $attachment, CaseHistoryAttachments $files): StreamedResponse
    {
        $this->ensureCommunication($caseFile, $communication);
        $item = collect($communication->metadata['history_attachments'] ?? [])->firstWhere('id', $attachment);
        abort_unless($item, 404);

        return $files->download($item);
    }

    /** Explicit opt-in delegates creation to the existing standalone CaseTask flow. */
    public function task(Request $request, CaseFile $caseFile, CaseActivity $communication, CaseTaskService $tasks): JsonResponse
    {
        $this->ensureCommunication($caseFile, $communication);
        $taskData = $request->validate(['assigned_employee_id' => ['required', Rule::exists('employees', 'id')->where('status', 'active')],
            'title' => ['required', 'string', 'max:255'], 'due_at' => ['nullable', 'date']]);

        return DB::transaction(function () use ($request, $caseFile, $communication, $tasks, $taskData) {
            CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            $activity = $caseFile->activities()->whereKey($communication->id)->lockForUpdate()->firstOrFail();
            $data = $activity->metadata['communication'];
            abort_if(! empty($data['linked_task_id']), 409, 'この連絡・面談にはすでにタスクが作成されています。');
            abort_unless(! empty($data['next_action']) || ! empty($data['next_action_due_at']), 422, '次回対応を登録してください。');
            $task = $tasks->createStandalone($caseFile, $request, [...$taskData, 'priority' => 'normal']);
            $activity->update(['metadata' => [...$activity->metadata, 'communication' => [...$data, 'linked_task_id' => $task->id]]]);

            return response()->json(['task' => $task->isVisibleTo($request->user()) ? $task->load('assignedEmployee') : null], 201);
        });
    }

    private function ensureCommunication(CaseFile $caseFile, CaseActivity $activity): void
    {
        abort_unless((int) $activity->case_file_id === $caseFile->id, 404);
        abort_unless($activity->activity_type === 'communication' && ($activity->metadata['history_kind'] ?? null) === 'communication'
            && is_array($activity->metadata['communication'] ?? null), 403, '操作履歴・旧形式の記録は編集できません。');
    }

    private function validated(Request $request, CaseFile $caseFile): array
    {
        if ($request->has('communication_data')) {
            $encoded = $request->input('communication_data');
            $payload = is_string($encoded) ? json_decode($encoded, true) : null;
            if (! is_array($payload) || array_is_list($payload) || array_key_exists('attachments', $payload)) {
                throw ValidationException::withMessages(['communication_data' => '連絡・面談の入力情報が不正です。']);
            }
            $request->merge($payload);
        }
        $data = $request->validate([
            'metadata' => ['prohibited'], 'activity_type' => ['prohibited'], 'created_by' => ['prohibited'],
            'communication_type' => ['required', Rule::in(self::TYPES)],
            'direction' => ['nullable', Rule::in(['inbound', 'outbound'])],
            'started_at' => ['required', 'date'], 'ended_at' => ['nullable', 'date', 'after_or_equal:started_at'],
            'subject' => ['required', 'string', 'max:255'], 'summary' => ['required', 'string', 'max:5000'],
            'details' => ['nullable', 'string', 'max:10000'], 'outcome' => ['nullable', 'string', 'max:5000'],
            'next_action' => ['nullable', 'string', 'max:255'], 'next_action_due_at' => ['nullable', 'date'],
            'counterparties' => ['required', 'array', 'min:1', 'max:20'], 'participants' => ['present', 'array', 'max:30'],
            'counterparties.*' => ['array:type,id,name'], 'participants.*' => ['array:type,id,name'],
            'counterparties.*.type' => ['required', Rule::in(['client', 'party', 'external'])],
            'participants.*.type' => ['required', Rule::in(['client', 'party', 'employee', 'external'])],
            'counterparties.*.id' => ['nullable', 'integer', 'min:1'], 'participants.*.id' => ['nullable', 'integer', 'min:1'],
            'counterparties.*.name' => ['nullable', 'string', 'max:255'], 'participants.*.name' => ['nullable', 'string', 'max:255'],
        ]);
        foreach (['counterparties', 'participants'] as $field) {
            $seen = [];
            foreach ($data[$field] as $index => &$person) {
                $id = $person['id'] ?? null;
                $name = match ($person['type']) {
                    'client' => $id === $caseFile->client_id ? $caseFile->client->name : null,
                    'party' => $caseFile->parties()->whereKey($id)->value('name'),
                    'employee' => Employee::whereKey($id)->where('status', 'active')->value('full_name'),
                    default => $id === null ? trim($person['name'] ?? '') : null,
                };
                $key = $person['type'].':'.($id ?? $name);
                if (! $name || isset($seen[$key])) {
                    throw ValidationException::withMessages(["{$field}.{$index}" => '現在の案件の相手・参加者を重複せず選択してください。']);
                }
                $seen[$key] = true;
                $person = ['type' => $person['type'], 'id' => $id, 'name' => $name];
            }
            unset($person);
        }
        foreach (['started_at', 'ended_at', 'next_action_due_at'] as $field) {
            $data[$field] = empty($data[$field]) ? null
                : Carbon::parse($data[$field])->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s');
        }
        $timed = in_array($data['communication_type'], ['phone', 'online_meeting', 'office_meeting', 'visit', 'other'], true);
        $data['duration_minutes'] = $timed && $data['ended_at'] ? (int) Carbon::parse($data['started_at'])->diffInMinutes(Carbon::parse($data['ended_at'])) : null;
        $data['direction'] = in_array($data['communication_type'], ['phone', 'email', 'chat', 'postal_mail'], true) ? ($data['direction'] ?? null) : null;
        foreach (['details', 'outcome', 'next_action'] as $field) {
            $data[$field] ??= null;
        }

        return $data;
    }

    private function permissions(Request $request): array
    {
        $view = $request->user()->hasPermission('case.view');
        $write = \App\Services\CaseAccessService::rehearsal()
            ? ($request->attributes->get('b31_case_presentation')['write'] ?? false) : true;

        return ['can_view_history' => $view, 'can_add_communication' => $view && $write && $request->user()->hasPermission('case.update'),
            'can_edit_communication' => $view && $write && $request->user()->hasPermission('case.update'),
            'can_create_task' => $view && $write && $request->user()->hasPermission('task.manage')];
    }

    private function entry(CaseActivity $activity, Request $request, string $kind): array
    {
        $write = \App\Services\CaseAccessService::rehearsal()?->presentationAllows($request->user(), $activity->case_file_id) ?? true;
        $meta = $activity->metadata ?? [];
        $communication = $meta['communication'] ?? null;
        $task = ! empty($communication['linked_task_id']) ? CaseTask::visibleTo($request->user())->where('case_file_id', $activity->case_file_id)->find($communication['linked_task_id']) : null;
        if ($communication) {
            $communication['has_linked_task'] = ! empty($communication['linked_task_id']);
            unset($communication['linked_task_id']);
            foreach (['started_at', 'ended_at', 'next_action_due_at'] as $field) {
                if (! empty($communication[$field])) {
                    $communication[$field] = Carbon::parse($communication[$field], config('app.timezone'))->toIso8601String();
                }
            }
        }

        return ['id' => 'activity:'.$activity->id, 'record_id' => $activity->id, 'kind' => $kind,
            'occurred_at' => $activity->occurred_at->toIso8601String(), 'title' => $activity->title, 'summary' => $activity->content,
            'actor' => $activity->createdByEmployee?->only(['id', 'full_name']) ?? (! empty($meta['actor_label']) ? ['id' => 0, 'full_name' => $meta['actor_label']] : null),
            'type' => $communication['communication_type'] ?? ($kind === 'system' ? 'system' : $this->legacyType($activity->channel)),
            'action_type' => $kind === 'system' ? ($meta['event'] ?? null) : null,
            'communication' => $communication, 'changes' => $this->displayChanges($meta['changes'] ?? $this->changes($meta)),
            'attachments' => $kind === 'communication' && $communication !== null
                ? array_map(fn ($item) => array_intersect_key($item, array_flip(['id', 'name', 'mime_type', 'size'])), $meta['history_attachments'] ?? [])
                : [],
            'linked_task' => $task?->only(['id', 'title']),
            'permissions' => ['can_edit' => $write && $kind === 'communication' && $communication !== null && $request->user()->hasPermission('case.update'),
                'can_create_task' => $write && $communication !== null && empty($communication['has_linked_task']) && $request->user()->hasPermission('task.manage')
                    && (! empty($communication['next_action']) || ! empty($communication['next_action_due_at']))],
            'created_at' => $activity->created_at?->toIso8601String(), 'updated_at' => $activity->updated_at?->toIso8601String(),
            'legacy' => $kind === 'communication' && $communication === null];
    }

    private function changes(array $meta): array
    {
        $changes = [];
        foreach (($meta['before'] ?? []) as $field => $value) {
            $after = $meta['after'][$field] ?? null;
            if ($value !== $after) {
                $changes[$field] = ['before' => $value, 'after' => $after];
            }
        }

        return $changes;
    }

    private function displayChanges(array $changes): array
    {
        foreach ($changes as $field => &$change) {
            if ($field !== 'assigned_employee_id' || ! is_array($change)) {
                continue;
            }
            foreach (['before', 'after'] as $side) {
                $id = $change[$side] ?? null;
                $change[$side] = $id === null ? '未割当' : (Employee::whereKey($id)->value('full_name') ?? '登録なし（ID '.$id.'）');
            }
        }
        unset($change);

        return $changes;
    }

    private function legacyEntry(CaseMeetingLog $log): array
    {
        return ['id' => 'meeting:'.$log->id, 'record_id' => $log->id, 'kind' => 'communication',
            'occurred_at' => $log->meeting_date->toIso8601String(), 'title' => '旧形式の連絡・面談記録', 'summary' => $log->content,
            'actor' => $log->createdByEmployee?->only(['id', 'full_name']), 'type' => $this->legacyType($log->interaction_type),
            'communication' => null, 'changes' => [], 'linked_task' => null,
            'legacy_detail' => ['参加者' => $log->attendees, '次回対応' => $log->next_action, '次回対応期限' => $log->next_action_due_at?->toIso8601String()],
            'permissions' => ['can_edit' => false, 'can_create_task' => false], 'legacy' => true];
    }

    private function channel(string $type): string
    {
        return ['chat' => 'line', 'online_meeting' => 'meeting', 'office_meeting' => 'meeting', 'visit' => 'meeting', 'phone' => 'phone', 'email' => 'email'][$type] ?? 'other';
    }

    private function legacyType(?string $channel): string
    {
        return ['phone' => 'phone', 'email' => 'email', 'line' => 'chat', 'meeting' => 'office_meeting'][$channel ?? ''] ?? 'other';
    }
}
