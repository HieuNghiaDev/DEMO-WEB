<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\User;

/** Resource checks for the existing JSON payload, not a new approval workflow. */
class ApprovalContextAccess
{
    public function allows(ApprovalRequest $approval, ?User $user, bool $write = false, ?\Closure $readReference = null): bool
    {
        $payload = $approval->payload;

        if (CaseAccessService::rehearsal() && (! is_array($payload) || ! $this->hasCaseReference($payload))) {
            return false; // Opaque legacy payload provenance cannot prove confidential scope.
        }
        return $payload === null || (is_array($payload) && $this->allowsPayload($payload, $user, $write, $readReference));
    }

    public function allowsPayload(array $payload, ?User $user, bool $write = false, ?\Closure $readReference = null): bool
    {
        foreach ($payload as $key => $value) {
            if (in_array($key, ['case_id', 'case_file_id', 'case_document_id', 'case_task_id'], true)) {
                if (! ($readReference && ! $write ? $readReference($key, $value) : $this->allowsReference($key, $value, $user, $write))) {
                    return false;
                }
            } elseif (is_array($value) && ! $this->allowsPayload($value, $user, $write, $readReference)) {
                return false;
            }
        }

        return true;
    }

    private function allowsReference(string $key, mixed $id, ?User $user, bool $write): bool
    {
        if ((! is_int($id) && ! is_string($id)) || ! preg_match('/^[1-9][0-9]*$/D', (string) $id)) {
            return false;
        }

        if ($key === 'case_task_id') {
            // A payload may contain task-private text, not just document progress.
            return CaseTask::query()->visibleTo($user)->whereKey($id)
                ->when($write, fn ($task) => $task->whereHas('caseFile',
                    fn ($case) => CaseAccessService::contentScope($case, $user, 'write')))->exists();
        }

        if ($key === 'case_document_id') {
            return CaseDocument::query()->whereKey($id)
                ->whereHas('caseFile', fn ($query) => CaseAccessService::contentScope($query, $user, $write ? 'write' : 'read'))->exists();
        }

        $query = CaseFile::query()->whereKey($id);
        return CaseAccessService::contentScope($query, $user, $write ? 'write' : 'read')->exists();
    }

    private function hasCaseReference(array $payload): bool
    {
        foreach ($payload as $key => $value) {
            if (in_array($key, ['case_id', 'case_file_id', 'case_document_id', 'case_task_id'], true)
                || (is_array($value) && $this->hasCaseReference($value))) return true;
        }
        return false;
    }
}
