<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use Illuminate\Support\Collection;
use RuntimeException;

class CaseDocumentChecklistGenerator
{
    /**
     * Explicit application action; callers must authorize access to the case.
     * Existing items (including soft-deleted ones) are never updated or restored.
     *
     * @return array{created_count: int, skipped_count: int, candidate_count: int, created_case_document_ids: list<int>}
     */
    public function generateForCase(CaseFile $caseFile): array
    {
        if (! $caseFile->exists || ! $caseFile->getKey()) {
            throw new RuntimeException('Checklist generation requires a persisted CaseFile.');
        }

        $connection = $caseFile->getConnectionName();

        return $caseFile->getConnection()->transaction(function () use ($caseFile, $connection): array {
            // Serialize initialization on a stable parent, and do not trust stale caller state.
            $case = CaseFile::on($connection)->whereKey($caseFile->getKey())->lockForUpdate()->first();
            if (! $case) {
                throw new RuntimeException('Checklist generation requires an existing, non-deleted CaseFile.');
            }
            $result = ['created_count' => 0, 'skipped_count' => 0, 'candidate_count' => 0, 'created_case_document_ids' => []];
            if ($case->case_type_id === null) {
                return $result;
            }

            $lineage = $this->lineage((int) $case->case_type_id, $connection);
            $date = today()->toDateString();
            $rules = CaseTypeDocumentRule::on($connection)->with(['documentType', 'purposes'])
                ->whereIn('case_type_id', $lineage)->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('effective_from')->orWhereDate('effective_from', '<=', $date))
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date))
                ->orderByDesc('version')->orderBy('id')->get();

            // Choose latest effective version per document AT EACH level first.
            // Then nearest level wins metadata; ancestors only contribute purpose IDs.
            $candidates = [];
            foreach ($lineage as $typeId) {
                $level = $rules->where('case_type_id', $typeId)->unique('document_type_id')
                    ->sortBy(fn ($rule) => [$rule->sort_order, $rule->id]);
                foreach ($level as $rule) {
                    $id = $rule->document_type_id;
                    $candidates[$id] ??= ['rule' => $rule, 'purpose_ids' => []];
                    $candidates[$id]['purpose_ids'] = array_values(array_unique([
                        ...$candidates[$id]['purpose_ids'], ...$rule->purposes->modelKeys(),
                    ]));
                }
            }
            $result['candidate_count'] = count($candidates);
            // A locking read sees items committed by the prior lock holder on MySQL as well.
            $existing = $case->documents()->withTrashed()->lockForUpdate()->get();
            $order = (int) ($existing->max('sort_order') ?? 0);
            foreach ($candidates as $candidate) {
                $rule = $candidate['rule'];
                if ($this->alreadyRepresented($existing, $rule)) {
                    $result['skipped_count']++;

                    continue;
                }
                if (! $rule->documentType) {
                    throw new RuntimeException("Document definition missing for rule {$rule->id}.");
                }
                // Rule metadata is TEXT but the existing case suggestion columns are VARCHAR(255).
                // Refuse incompatible metadata rather than silently truncating historical context.
                foreach (['standard_source', 'standard_target_person'] as $field) {
                    if (mb_strlen((string) $rule->$field) > 255) {
                        throw new RuntimeException("Rule {$rule->id} {$field} exceeds the case field capacity.");
                    }
                }
                if (! in_array($rule->priority_default, CaseDocument::COLLECTION_PRIORITIES, true)) {
                    throw new RuntimeException("Unsupported collection priority on rule {$rule->id}.");
                }
                $document = $case->documents()->create([
                    'document_type_id' => $rule->document_type_id,
                    'case_type_document_rule_id' => $rule->id,
                    'is_template_generated' => true,
                    'title' => $rule->documentType->name_ja,
                    'category' => 'チェックリスト',
                    // Legacy display fields remain candidates too, independent of necessity.
                    'requirement_level' => 'conditional', 'status' => 'not_requested', 'version' => '1',
                    'necessity_status' => 'undetermined', 'collection_status' => 'not_started',
                    'fulfillment_status' => 'undetermined', 'review_status' => 'unreviewed',
                    'rule_version_snapshot' => $rule->version,
                    'applicability_condition_snapshot' => $rule->applicability_condition,
                    'rule_source_snapshot' => $rule->master_source,
                    'collection_source' => $rule->standard_source,
                    'target_person' => $rule->standard_target_person,
                    'target_scope' => $rule->standard_period_rule,
                    'target_period_from' => null, 'target_period_to' => null,
                    'collection_priority' => $rule->priority_default,
                    'preservation_priority' => $rule->preservation_priority,
                    // Rule has a preservation flag but no preservation-reason text field.
                    'preservation_reason' => null,
                    'sort_order' => ++$order,
                ]);
                $document->purposes()->attach($candidate['purpose_ids']);
                $result['created_case_document_ids'][] = $document->id;
                $result['created_count']++;
            }

            return $result;
        });
    }

    /** @return list<int> Selected type first, root last. */
    private function lineage(int $selectedId, ?string $connection): array
    {
        $lineage = [];
        $seen = [];
        $id = $selectedId;
        while ($id !== null) {
            if (isset($seen[$id])) {
                throw new RuntimeException("Cyclic case type hierarchy at case type {$id}.");
            }
            $seen[$id] = true;
            $type = CaseType::on($connection)->find($id);
            if (! $type) {
                throw new RuntimeException("Invalid case type hierarchy: missing case type {$id}.");
            }
            $lineage[] = (int) $type->id;
            $id = $type->parent_id === null ? null : (int) $type->parent_id;
        }

        return $lineage;
    }

    private function alreadyRepresented(Collection $existing, CaseTypeDocumentRule $rule): bool
    {
        foreach ($existing as $document) {
            if ($document->is_template_generated && (
                (int) $document->document_type_id === (int) $rule->document_type_id
                || (int) $document->case_type_document_rule_id === (int) $rule->id
            )) {
                // Preserve operator edits, old versions, case-type changes and deletion decisions.
                return true;
            }
            if ($document->is_template_generated || $document->trashed()
                || (int) $document->document_type_id !== (int) $rule->document_type_id) {
                continue;
            }
            if ($document->target_period_from !== null || $document->target_period_to !== null) {
                continue;
            }
            // Narrow manual duplicate check, not fuzzy matching by title/provider/person.
            if ($this->sameText($document->collection_source, $rule->standard_source)
                && $this->sameText($document->target_person, $rule->standard_target_person)
                && $this->sameText($document->target_scope, $rule->standard_period_rule)
                && ($document->rule_version_snapshot === null || $document->rule_version_snapshot === $rule->version)
                && ($document->applicability_condition_snapshot === null || $document->applicability_condition_snapshot === $rule->applicability_condition)
                && ($document->rule_source_snapshot === null || $document->rule_source_snapshot === $rule->master_source)) {
                return true;
            }
        }

        return false;
    }

    private function sameText(?string $left, ?string $right): bool
    {
        return trim($left ?? '') === trim($right ?? '');
    }
}
