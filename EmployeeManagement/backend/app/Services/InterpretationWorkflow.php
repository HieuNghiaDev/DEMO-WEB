<?php

namespace App\Services;

use App\Models\CaseFile;
use App\Models\Interpreter;
use App\Models\InterpretationRequest;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class InterpretationWorkflow
{
    public const STATUSES = ['pending', 'arranging', 'confirmed', 'completed', 'cancelled'];
    private const EDITABLE = ['pending', 'arranging', 'confirmed'];

    public function __construct(private CaseWorkspaceAuditService $audit) {}

    public function create(Request $request, CaseFile $case, array $data): InterpretationRequest
    {
        return DB::transaction(function () use ($request, $case, $data) {
            // Parent lock also serializes first-use request keys for the same case.
            $case = CaseFile::whereKey($case->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user())->authorize('create', [InterpretationRequest::class, $case]);
            $payload = $this->schedule($data);
            $key = $data['request_key'];
            $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
            $old = InterpretationRequest::where('case_file_id', $case->id)->where('created_by_user_id', $request->user()->id)
                ->where('request_key', $key)->lockForUpdate()->first();
            if ($old) {
                abort_unless(hash_equals($old->creation_hash, $hash), 409, '同じ送信キーで内容を変更できません。');
                return $old;
            }
            if ($payload['interpreter_id']) Gate::forUser($request->user())->authorize('assignAny', [InterpretationRequest::class, $case]);
            $this->reserve($payload['interpreter_id'], $payload['starts_at'], $payload['ends_at']);
            $item = new InterpretationRequest;
            $item->forceFill([...$payload, 'case_file_id' => $case->id,
                'created_by_user_id' => $request->user()->id, 'updated_by_user_id' => $request->user()->id,
                'request_key' => $key, 'creation_hash' => $hash, 'revision' => 1, 'status' => 'pending']);
            $item->save();
            $this->record($request, $case, $item, 'created', '通訳依頼を追加', []);
            return $item;
        }, 3);
    }

    public function change(Request $request, CaseFile $case, InterpretationRequest $item, string $action, array $data): InterpretationRequest
    {
        return DB::transaction(function () use ($request, $case, $item, $action, $data) {
            $case = CaseFile::whereKey($case->id)->lockForUpdate()->firstOrFail();
            $item = InterpretationRequest::where('case_file_id', $case->id)->whereKey($item->id)->lockForUpdate()->firstOrFail();
            $ability = $action === 'status' ? ($data['status'] === 'cancelled' ? 'cancel' : 'transition') : $action;
            Gate::forUser($request->user())->authorize($ability, $item);
            abort_unless($item->revision === (int) $data['revision'], 409, '内容が更新されています。再取得してからやり直してください。');
            abort_unless(in_array($item->status, self::EDITABLE, true), 409, '完了・キャンセル済みの依頼は変更できません。');
            $before = $item->only(['status', 'interpreter_id', 'revision']);
            if ($action === 'update') {
                $payload = $this->schedule([...$data, 'interpreter_id' => $item->interpreter_id]);
                $this->reserve($item->interpreter_id, $payload['starts_at'], $payload['ends_at'], $item->id);
                $item->fill($payload);
            } elseif ($action === 'assign') {
                $id = $data['interpreter_id'] ?? null;
                abort_if($item->status === 'confirmed' && $id === null, 409, '確定済みの依頼には通訳者が必要です。');
                $this->reserve($id, $item->starts_at, $item->ends_at, $item->id);
                $item->interpreter_id = $id;
            } else {
                $next = ['pending' => 'arranging', 'arranging' => 'confirmed', 'confirmed' => 'completed'][$item->status] ?? null;
                abort_unless($data['status'] === $next || $data['status'] === 'cancelled', 409, 'この状態には変更できません。');
                if (in_array($data['status'], ['confirmed', 'completed'], true)) {
                    abort_unless($item->interpreter_id !== null, 422, '通訳者を割り当ててください。');
                    $this->reserve($item->interpreter_id, $item->starts_at, $item->ends_at, $item->id);
                }
                $item->status = $data['status'];
                $item->cancellation_reason = $data['status'] === 'cancelled' ? trim($data['cancellation_reason']) : null;
            }
            if (! $item->isDirty()) return $item;
            $item->revision++;
            $item->updated_by_user_id = $request->user()->id;
            $item->save();
            $title = ['update' => '通訳依頼を更新', 'assign' => '通訳者を変更', 'status' => '通訳依頼の状態を変更'][$action];
            $this->record($request, $case, $item, $action, $title, $before);
            return $item;
        }, 3);
    }

    public function conflict(?int $id, string $start, string $end, ?int $exclude = null, bool $currentRead = false): bool
    {
        if (! $id) return false;
        // No cross-case identity/description is returned, including hidden confidential reservations.
        $query = InterpretationRequest::where('interpreter_id', $id)->whereIn('status', self::EDITABLE)
            ->when($exclude, fn ($q) => $q->where('id', '<>', $exclude))
            ->where('starts_at', '<', $end)->where('ends_at', '>', $start);
        // InnoDB REPEATABLE READ can retain a snapshot from before the interpreter lock wait.
        // The writer needs a current read; the advisory endpoint remains a nonlocking lookup.
        if ($currentRead) {
            if (DB::transactionLevel() < 1) throw new \LogicException('Reservation requires a transaction.');
            return $query->lockForUpdate()->first(['id']) !== null;
        }
        return $query->exists();
    }

    private function reserve(?int $id, string $start, string $end, ?int $exclude = null): void
    {
        if (! $id) return;
        // The shared interpreter row serializes reservations across different cases.
        $interpreter = Interpreter::whereKey($id)->lockForUpdate()->first();
        if (! $interpreter?->available()) throw ValidationException::withMessages(['interpreter_id' => '有効な通訳者を選択してください。']);
        abort_if($this->conflict($id, $start, $end, $exclude, true), 409, '通訳者の予定が重複しています。別の時間または通訳者を選択してください。');
    }

    public function schedule(array $data): array
    {
        $start = CarbonImmutable::parse($data['starts_at'])->utc();
        $end = CarbonImmutable::parse($data['ends_at'])->utc();
        if ($end <= $start || $start->diffInSeconds($end) > 86400) {
            throw ValidationException::withMessages(['ends_at' => '終了は開始より後、24時間以内にしてください。']);
        }
        return ['language' => trim($data['language']), 'work_type' => $data['work_type'], 'mode' => $data['mode'],
            'content' => trim($data['content']), 'starts_at' => $start->format('Y-m-d H:i:s'), 'ends_at' => $end->format('Y-m-d H:i:s'),
            'location' => $data['location'] ?? null, 'notes' => $data['notes'] ?? null, 'interpreter_id' => isset($data['interpreter_id']) ? (int) $data['interpreter_id'] : null];
    }

    private function record(Request $request, CaseFile $case, InterpretationRequest $item, string $event, string $title, array $before): void
    {
        // No fee, appointment contents or external contact PII in the shared case timeline.
        $this->audit->record($case, $request, $title, null, ['event' => 'interpretation.'.$event,
            'interpretation_request_id' => $item->id, 'before' => $before,
            'after' => $item->only(['status', 'interpreter_id', 'revision'])]);
    }
}
