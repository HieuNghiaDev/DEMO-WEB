<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\EmployeeNotification;
use App\Models\EmployeeTask;
use App\Models\User;
use Illuminate\Support\Collection;

/** Recheck persisted notices after revocation; stored text is not authorization proof. */
class CaseNotificationAccess
{
    private const REFERENCES = ['case_id', 'case_file_id', 'case_document_id', 'case_task_id'];

    public function allows(EmployeeNotification $notification, User $user): bool
    {
        return $this->filter(collect([$notification]), $user)->isNotEmpty();
    }

    public function filter(Collection $notices, User $user): Collection
    {
        $strict = CaseAccessService::rehearsal() !== null;
        $chatIds = array_filter($notices->pluck('data.chat_message_id')->all(), $this->id(...));
        $visibleChat = $chatIds === [] ? [] : array_flip(app(InternalChatService::class)->visibleMessageIds($user, $chatIds));
        $approvals = $this->lookup(ApprovalRequest::query(), $notices->pluck('data.approval_id')->all(), ['id', 'payload']);
        $tasks = $this->lookup(EmployeeTask::query(), $notices->pluck('data.assigned_task_id')->all());
        $visibleTasks = $this->lookup(EmployeeTask::query()->visibleTo($user), $tasks->keys()->all());
        $ids = array_fill_keys(self::REFERENCES, []);
        $gather = function (array $data) use (&$gather, &$ids): void {
            foreach ($data as $key => $value) {
                if (array_key_exists($key, $ids) && $this->id($value)) {
                    $ids[$key][] = (int) $value;
                } elseif (is_array($value)) {
                    $gather($value);
                }
            }
        };
        foreach ($notices as $notice) {
            $data = $notice->data;
            if (! is_array($data)) continue;
            $gather($data);
            if ($this->casePath($data, $match)) $ids['case_id'][] = (int) $match[1];
        }
        foreach ($approvals as $approval) {
            if (is_array($approval->payload)) $gather($approval->payload);
        }
        $cases = $this->lookup(CaseAccessService::contentScope(CaseFile::query(), $user, 'read'),
            [...$ids['case_id'], ...$ids['case_file_id']]);
        $documents = $this->lookup(CaseDocument::query()->whereHas('caseFile',
            fn ($query) => CaseAccessService::contentScope($query, $user, 'read')), $ids['case_document_id']);
        $caseTasks = $this->lookup(CaseTask::query()->visibleTo($user), $ids['case_task_id']);
        $references = ['case_id' => $cases, 'case_file_id' => $cases, 'case_document_id' => $documents, 'case_task_id' => $caseTasks];
        $allowed = fn ($key, $id) => $this->id($id) && $references[$key]->has((int) $id);
        $approvalAccess = app(ApprovalContextAccess::class);
        $canReview = $notices->contains(fn ($notice) => ($notice->data['notification_type'] ?? null) === 'approval_request')
            && $user->hasPermission('approval.approve');

        return $notices->filter(function ($notice) use ($user, $strict, $approvals, $tasks, $visibleTasks, $cases, $allowed, $approvalAccess, $canReview, $visibleChat) {
            $data = $notice->data;
            if (! is_array($data)) return ! $strict;
            $recognized = array_intersect(self::REFERENCES, array_keys($data)) !== [];
            if (array_key_exists('chat_message_id', $data)) {
                if (! $this->id($data['chat_message_id']) || ! isset($visibleChat[(int) $data['chat_message_id']])) return false;
                $recognized = true;
            }
            if (! $approvalAccess->allowsPayload($data, $user, false, $allowed)) return false;
            if (array_key_exists('approval_id', $data)) {
                if (! $this->id($data['approval_id']) || (($data['notification_type'] ?? null) === 'approval_request' && ! $canReview)) return false;
                $approval = $approvals->get((int) $data['approval_id']);
                if ($approval ? ! $approvalAccess->allows($approval, $user, false, $allowed) : $strict) return false;
                $recognized = $recognized || $approval !== null;
            }
            if (array_key_exists('assigned_task_id', $data)) {
                if (! $this->id($data['assigned_task_id'])) return false;
                $taskId = (int) $data['assigned_task_id'];
                if ($tasks->has($taskId) ? ! $visibleTasks->has($taskId) : $strict) return false;
                $recognized = $recognized || $tasks->has($taskId);
            }
            if (is_string($data['target_path'] ?? null) && str_starts_with($data['target_path'], '/quests/')) {
                if (! $this->casePath($data, $match) || ! $cases->has((int) $match[1])) return false;
                $recognized = true;
            }

            return $recognized || ! $strict;
        });
    }

    private function lookup($query, array $ids, array $columns = ['id']): Collection
    {
        $valid = array_unique(array_filter($ids, $this->id(...)));

        return $valid === [] ? collect() : $query->whereKey($valid)->get($columns)->keyBy('id');
    }

    private function casePath(array $data, ?array &$match): bool
    {
        return is_string($data['target_path'] ?? null)
            && preg_match('~^/quests/([1-9][0-9]*)(?:[?#].*)?$~D', $data['target_path'], $match) === 1;
    }

    private function id(mixed $id): bool
    {
        return (is_int($id) || is_string($id)) && preg_match('/^[1-9][0-9]*$/D', (string) $id) === 1;
    }
}
