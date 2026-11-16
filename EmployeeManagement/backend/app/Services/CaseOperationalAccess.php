<?php

namespace App\Services;

use App\Models\CaseFile;
use App\Models\Client;
use App\Models\User;
use App\Services\Administration\MainRoles;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

final class CaseOperationalAccess
{
    private const TABLE = 'case_operational_grants';
    public const FLAGS = ['create_tasks', 'review_tasks', 'edit_overview'];

    /** Keep the authority contract for installations that have yet to install the five roles. */
    public static function enforced(): bool
    {
        return self::requestValue('case_operations.enforced', fn () => MainRoles::installed());
    }

    public static function ready(): bool
    {
        return self::requestValue('case_operations.schema', fn () => Schema::hasTable(self::TABLE));
    }

    private static function requestValue(string $key, callable $load): mixed
    {
        $attributes = request()->attributes;
        if (! $attributes->has($key)) $attributes->set($key, $load());
        return $attributes->get($key);
    }

    private static function isSupervisor(?User $user): bool
    {
        return $user?->hasAnyRole(['lawyer', 'admin']) ?? false;
    }

    public static function canDelegate(?User $user): bool
    {
        return self::enforced() && self::ready() && self::activeEmployee($user) && self::isSupervisor($user)
            && $user->hasPermission('case.assign');
    }

    private static function activeEmployee(?User $user): bool
    {
        return $user !== null && $user->is_active && ! $user->activation_required && ! $user->must_change_password
            && $user->employee?->status === 'active';
    }

    private static function isCaseTaskAssistant(User $user): bool
    {
        return self::activeEmployee($user) && $user->hasRole('legal_assistant');
    }

    public static function capabilities(?User $user, int $caseId, bool $presentation = false): array
    {
        $resolve = function () use ($user, $caseId, $presentation): array {
            $permissions = [
                'create_tasks' => $user?->hasPermission('task.manage') ?? false,
                'review_tasks' => $user?->hasPermission('task.review') ?? false,
                'edit_overview' => $user?->hasPermission('case.update') ?? false,
                'manage_tasks' => $user?->hasPermission('task.manage') ?? false,
                'delegate' => self::canDelegate($user),
            ];
            if ($permissions['create_tasks'] && $user && MainRoles::assigned($user)) {
                $permissions['create_tasks'] = $user->hasPermission('task.create') && $user->hasPermission('task.assign');
            }
            if ($presentation) {
                $write = CaseAccessService::presentationWrite($user, $caseId);
            } else {
                $write = CaseAccessService::contentAllows($user, $caseId, 'write');
            }
            if (! $write) return array_fill_keys(array_keys($permissions), false);

            if (! self::enforced() || self::isSupervisor($user)) return $permissions;

            $grant = self::ready() && self::activeEmployee($user) ? DB::table(self::TABLE)
                ->where('case_file_id', $caseId)->where('user_id', $user->id)
                ->where('employee_id', $user->employee_id)->first() : null;
            return [
                'create_tasks' => ($user && self::isCaseTaskAssistant($user) && $permissions['create_tasks'])
                    || (bool) ($grant->create_tasks ?? false),
                'review_tasks' => (bool) ($grant->review_tasks ?? false),
                'edit_overview' => (bool) ($grant->edit_overview ?? false),
                'manage_tasks' => false,
                'delegate' => false,
            ];
        };

        return $presentation ? self::requestValue('case_operations.flags.'.($user?->id ?? 0).'.'.$caseId, $resolve) : $resolve();
    }

    public static function authorize(?User $user, int $caseId, string $action): void
    {
        if (! (self::capabilities($user?->fresh(), $caseId)[$action] ?? false)) {
            throw new AuthorizationException('この案件で操作する権限がありません。');
        }
    }

    public static function hasGlobalTaskView(?User $user): bool
    {
        return $user?->hasPermission('task.view_all')
            && (! self::enforced() || self::isSupervisor($user));
    }

    public static function canReviewFile(?User $user, int $caseId, string $source, bool $presentation = false): bool
    {
        return self::capabilities($user, $caseId, $presentation)['review_tasks']
            && ($source === 'task_submission' || ! self::enforced() || self::isSupervisor($user));
    }

    public static function scopeTasks(Builder $query, User $user): Builder
    {
        if (self::hasGlobalTaskView($user)) return $query;
        $employeeId = self::activeEmployee($user) ? $user->employee_id : null;
        if ($employeeId === null) return $query->whereRaw('1 = 0');
        // The caller has already scoped the tasks to cases the user may read.
        if (self::isCaseTaskAssistant($user)) return $query;

        return $query->where(function (Builder $visible) use ($query, $user, $employeeId): void {
            $visible->where($query->qualifyColumn('assigned_employee_id'), $employeeId);
            if (! self::enforced() || ! self::ready()) return;
            $visible->orWhereIn($query->qualifyColumn('case_file_id'), CaseAccessService::contentScope(CaseFile::query(), $user, 'write')
                ->select('case_files.id')->whereIn('case_files.id', DB::table(self::TABLE)->select('case_file_id')
                    ->where('user_id', $user->id)->where('employee_id', $employeeId)
                    ->where(fn ($grant) => $grant->where('create_tasks', true)->orWhere('review_tasks', true))));
        });
    }

    /** Client identity is shared. A scoped edit must be authorized on every linked case. */
    public static function canEditClient(?User $user, Client $client, bool $presentation = false): bool
    {
        $cases = $client->caseFiles()->withTrashed()->pluck('id');
        if ($cases->isEmpty()) return $user?->hasPermission('case.update') ?? false;
        return $cases->every(fn ($id) => self::capabilities($user, $id, $presentation)['edit_overview']);
    }

    public static function rules(): array
    {
        return [
            'task_delegations' => ['sometimes', 'array', 'max:100'],
            'task_delegations.*' => ['required', 'array:user_id,create_tasks,review_tasks,edit_overview'],
            'task_delegations.*.user_id' => ['required', 'integer', 'distinct', 'min:1'],
            'task_delegations.*.create_tasks' => ['required', 'boolean'],
            'task_delegations.*.review_tasks' => ['required', 'boolean'],
            'task_delegations.*.edit_overview' => ['required', 'boolean'],
        ];
    }

    public static function candidates(User $actor): Collection
    {
        return User::query()->whereKeyNot($actor->id)->where('is_active', true)
            ->where('activation_required', false)->where('must_change_password', false)
            ->whereHas('employee', fn ($employee) => $employee->where('status', 'active'))
            ->whereDoesntHave('roles', fn ($roles) => $roles->whereIn('name', ['admin', 'lawyer']))
            ->with('employee:id,full_name,status')->get(['id', 'employee_id'])
            ->filter(fn (User $candidate) => $candidate->hasPermission('case.view'))->values();
    }

    public static function grants(CaseFile $case): array
    {
        return DB::table(self::TABLE)->where('case_file_id', $case->id)->orderBy('user_id')->get()
            ->map(fn (object $row) => ['user_id' => (int) $row->user_id, ...array_map(
                fn (string $flag) => (bool) $row->$flag, array_combine(self::FLAGS, self::FLAGS))])->all();
    }

    /** Caller owns the transaction and case lock (a new case is already locked by insertion). */
    public static function replace(CaseFile $case, Request $request, array $rows): void
    {
        $actor = $request->user()?->fresh();
        self::authorize($actor, $case->id, 'delegate');
        $candidates = self::candidates($actor)->keyBy('id');
        $before = self::grants($case);
        $data = [];
        foreach ($rows as $row) {
            $target = $candidates->get($row['user_id']);
            $flags = array_map(fn ($flag) => (bool) $row[$flag], array_combine(self::FLAGS, self::FLAGS));
            if (! $target || ! in_array(true, $flags, true) || ! CaseAccessService::contentAllows($target, $case->id, 'write')) {
                throw ValidationException::withMessages(['task_delegations' => '対象案件を操作できる在籍社員と権限を選択してください。']);
            }
            $data[] = ['case_file_id' => $case->id, 'user_id' => $target->id, 'employee_id' => $target->employee_id, ...$flags];
        }
        DB::table(self::TABLE)->where('case_file_id', $case->id)->delete();
        if ($data !== []) DB::table(self::TABLE)->insert($data);
        $after = self::grants($case);
        if ($before !== $after) {
            app(SecurityAuditLogger::class)->recordCaseOperationalGrants($actor, $case->id, $before, $after);
            app(CaseWorkspaceAuditService::class)->record($case, $request, '案件の委任権限を更新', null,
                ['event' => 'case.operations.delegation.updated']);
        }
    }
}
