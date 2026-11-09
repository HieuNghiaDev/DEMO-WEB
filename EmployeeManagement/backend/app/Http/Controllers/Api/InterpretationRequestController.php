<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveInterpretationRequest;
use App\Models\CaseFile;
use App\Models\Employee;
use App\Models\Interpreter;
use App\Models\InterpretationRequest;
use App\Policies\InterpretationRequestPolicy;
use App\Services\CaseWorkspaceAuditService;
use App\Services\InterpretationWorkflow;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class InterpretationRequestController extends Controller
{
    private function admit(Request $request, CaseFile $case): array
    {
        Gate::forUser($request->user())->authorize('viewAny', [InterpretationRequest::class, $case]);
        abort_unless(Schema::hasTable('interpretation_requests') && Schema::hasTable('interpreters'), 503,
            '通訳管理の初期設定が完了していません。管理者に確認してください。');
        $policy = app(InterpretationRequestPolicy::class);
        $caps = [];
        foreach (['create', 'update', 'assign', 'transition', 'cancel', 'view_costs'] as $action) {
            $caps['can_'.$action] = $policy->capability($request->user(), $case, $action);
        }
        return $caps;
    }

    private function item(CaseFile $case, int $id): InterpretationRequest
    {
        return InterpretationRequest::where('case_file_id', $case->id)->findOrFail($id);
    }

    private function present(InterpretationRequest $item): array
    {
        $item->loadMissing('interpreter.employee');
        // Whitelist: never serialize arbitrary future finance/HR fields or whole related models.
        return [...$item->only(['id', 'case_file_id', 'language', 'work_type', 'mode', 'content', 'location', 'notes',
            'status', 'cancellation_reason', 'revision']),
            'starts_at' => CarbonImmutable::parse($item->starts_at, 'UTC')->toISOString(),
            'ends_at' => CarbonImmutable::parse($item->ends_at, 'UTC')->toISOString(),
            'interpreter' => $item->interpreter?->summary(), 'updated_at' => $item->updated_at?->toISOString()];
    }

    public function index(Request $request, CaseFile $caseFile): JsonResponse
    {
        $caps = $this->admit($request, $caseFile);
        $query = InterpretationRequest::where('case_file_id', $caseFile->id);
        $counts = (clone $query)->selectRaw('status, COUNT(*) AS total')->groupBy('status')->pluck('total', 'status');
        $page = $query->with('interpreter.employee')->orderBy('starts_at')->orderBy('id')->paginate(20);
        return response()->json(['items' => $page->getCollection()->map(fn ($item) => $this->present($item)),
            'statistics' => collect(InterpretationWorkflow::STATUSES)->mapWithKeys(fn ($status) => [$status => (int) ($counts[$status] ?? 0)]),
            'pagination' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'capabilities' => $caps]);
    }

    public function show(Request $request, CaseFile $caseFile, int $interpretationRequest): JsonResponse
    {
        $caps = $this->admit($request, $caseFile);
        return response()->json(['item' => $this->present($this->item($caseFile, $interpretationRequest)), 'capabilities' => $caps]);
    }

    public function store(SaveInterpretationRequest $request, CaseFile $caseFile, InterpretationWorkflow $workflow): JsonResponse
    {
        $this->admit($request, $caseFile);
        return response()->json(['item' => $this->present($workflow->create($request, $caseFile, $request->validated()))], 201);
    }

    public function update(SaveInterpretationRequest $request, CaseFile $caseFile, int $interpretationRequest, InterpretationWorkflow $workflow): JsonResponse
    {
        $this->admit($request, $caseFile);
        return response()->json(['item' => $this->present($workflow->change($request, $caseFile,
            $this->item($caseFile, $interpretationRequest), 'update', $request->validated()))]);
    }

    public function assignment(Request $request, CaseFile $caseFile, int $interpretationRequest, InterpretationWorkflow $workflow): JsonResponse
    {
        $this->admit($request, $caseFile);
        $data = $request->validate(['revision' => ['required', 'integer', 'min:1'], 'interpreter_id' => ['present', 'nullable', 'integer', 'min:1']]);
        return response()->json(['item' => $this->present($workflow->change($request, $caseFile,
            $this->item($caseFile, $interpretationRequest), 'assign', $data))]);
    }

    public function status(Request $request, CaseFile $caseFile, int $interpretationRequest, InterpretationWorkflow $workflow): JsonResponse
    {
        $this->admit($request, $caseFile);
        $data = $request->validate(['revision' => ['required', 'integer', 'min:1'],
            'status' => ['required', Rule::in(InterpretationWorkflow::STATUSES)],
            'cancellation_reason' => ['required_if:status,cancelled', 'nullable', 'string', 'max:500']]);
        return response()->json(['item' => $this->present($workflow->change($request, $caseFile,
            $this->item($caseFile, $interpretationRequest), 'status', $data))]);
    }

    public function history(Request $request, CaseFile $caseFile, int $interpretationRequest): JsonResponse
    {
        $this->admit($request, $caseFile);
        $item = $this->item($caseFile, $interpretationRequest);
        $events = $caseFile->activities()->where('metadata->interpretation_request_id', $item->id)
            ->orderByDesc('id')->paginate(30);
        return response()->json(['events' => $events->getCollection()->map(fn ($event) => [
            'id' => $event->id, 'title' => $event->title, 'occurred_at' => $event->occurred_at?->toISOString(),
            'actor_user_id' => $event->metadata['actor_user_id'] ?? null,
            'actor_name' => $event->metadata['actor_label'] ?? null,
            'before' => $event->metadata['before'] ?? [], 'after' => $event->metadata['after'] ?? [],
        ]), 'pagination' => ['page' => $events->currentPage(), 'last_page' => $events->lastPage()]]);
    }

    public function options(Request $request, CaseFile $caseFile): JsonResponse
    {
        $caps = $this->admit($request, $caseFile);
        abort_unless($caps['can_create'] || $caps['can_assign'], 403);
        $profiles = $caps['can_assign'] ? Interpreter::with('employee')->where('is_active', true)->orderBy('id')->get()
            ->filter(fn ($profile) => $profile->available())->map(fn ($profile) => $profile->summary())->values() : [];
        // Registering internal profiles needs the existing directory permission as well as assign.
        $employees = $caps['can_assign'] && $request->user()->hasPermission('employee.view')
            ? Employee::where('status', 'active')->orderBy('full_name')->get(['id', 'full_name'])
                ->map(fn ($employee) => ['id' => $employee->id, 'name' => $employee->full_name]) : [];
        return response()->json(['interpreters' => $profiles, 'employees' => $employees]);
    }

    public function registerInterpreter(Request $request, CaseFile $caseFile, CaseWorkspaceAuditService $audit): JsonResponse
    {
        $this->admit($request, $caseFile);
        Gate::forUser($request->user())->authorize('assignAny', [InterpretationRequest::class, $caseFile]);
        $data = $request->validate(['kind' => ['required', Rule::in(['employee', 'external'])],
            'employee_id' => ['required_if:kind,employee', 'prohibited_unless:kind,employee', 'integer', 'min:1'],
            'display_name' => ['required_if:kind,external', 'prohibited_unless:kind,external', 'string', 'max:120'],
            'registration_key' => ['required', 'uuid']]);
        $profile = DB::transaction(function () use ($request, $caseFile, $data, $audit) {
            $case = CaseFile::whereKey($caseFile->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user())->authorize('assignAny', [InterpretationRequest::class, $case]);
            $employee = null;
            if ($data['kind'] === 'employee') {
                abort_unless($request->user()->hasPermission('employee.view'), 403);
                $employee = Employee::where('status', 'active')->whereKey($data['employee_id'])->lockForUpdate()->firstOrFail();
            }
            $payload = ['kind' => $data['kind'], 'employee_id' => $employee?->id,
                'display_name' => $data['kind'] === 'external' ? trim($data['display_name']) : null];
            $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
            $old = Interpreter::where('registration_key', $data['registration_key'])->first();
            if ($old) {
                abort_unless((int) $old->created_by_user_id === $request->user()->id && hash_equals($old->registration_hash, $hash), 409);
                return $old;
            }
            if ($employee && ($old = Interpreter::where('employee_id', $employee->id)->first())) return $old;
            $profile = new Interpreter;
            $profile->forceFill([...$payload, 'is_active' => true, 'created_by_user_id' => $request->user()->id,
                'registration_key' => $data['registration_key'], 'registration_hash' => $hash]);
            $profile->save();
            $audit->record($case, $request, '通訳者を登録', null, ['event' => 'interpretation.interpreter_registered', 'interpreter_id' => $profile->id]);
            return $profile;
        }, 3);
        return response()->json(['interpreter' => $profile->summary()], 201);
    }

    public function conflicts(SaveInterpretationRequest $request, CaseFile $caseFile, InterpretationWorkflow $workflow): JsonResponse
    {
        $caps = $this->admit($request, $caseFile);
        abort_unless($caps['can_assign'], 403);
        $data = $request->validated();
        $schedule = $workflow->schedule($data);
        $id = $schedule['interpreter_id'];
        if ($id) abort_unless(Interpreter::find($id)?->available(), 422);
        return response()->json(['has_conflict' => $workflow->conflict($id, $schedule['starts_at'], $schedule['ends_at'])]);
    }
}
