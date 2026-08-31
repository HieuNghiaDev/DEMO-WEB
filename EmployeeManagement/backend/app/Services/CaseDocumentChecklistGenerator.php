<?php

namespace App\Services;

use App\Exceptions\ChecklistPlanningException;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\DocumentPurpose;
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

            ['candidates' => $candidates, 'existing' => $existing] = $this->plan($case, true);
            $result['candidate_count'] = count($candidates);
            $order = (int) ($existing->max('sort_order') ?? 0);
            foreach ($candidates as $candidate) {
                $rule = $candidate['rule'];
                if ($candidate['represented']) {
                    $result['skipped_count']++;

                    continue;
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

    /** Read-only, advisory counts. POST must re-plan under the case lock. */
    public function previewForCase(CaseFile $caseFile): array
    {
        $connection = $caseFile->getConnectionName();
        $case = CaseFile::on($connection)->findOrFail($caseFile->getKey());
        $type = $case->case_type_id === null ? null : CaseType::on($connection)->find($case->case_type_id);
        // A missing selected type is a UI unavailable state, not a guessed type or a 500.
        if ($type === null) {
            $case->case_type_id = null;
        }
        ['candidates' => $candidates, 'existing' => $existing] = $this->plan($case, false);
        $active = $existing->reject(fn ($item) => $item->trashed());
        $manual = $active->where('is_template_generated', false)->count();
        $legacy = $active->filter(fn ($item) => $item->template_item_id !== null || $item->document_type_id === null
            || $item->file_url !== null || $item->status !== 'not_requested')->count();
        $deletedGenerated = $existing->filter(fn ($item) => $item->trashed() && $item->is_template_generated)->count();
        $warnings = [];
        if ($type === null) {
            $warnings[] = ['code' => 'case_type_missing', 'message' => '事件類型を設定してから収集リストを作成してください。'];
        } elseif ($candidates === []) {
            $warnings[] = ['code' => 'no_rules', 'message' => '現在の事件類型に有効な候補資料がありません。'];
        }
        if ($manual > 0) {
            $warnings[] = ['code' => 'manual_items_present', 'message' => '手動追加された収集項目があります。重複候補を確認してください。'];
        }
        if ($legacy > 0) {
            $warnings[] = ['code' => 'legacy_document_items_present', 'message' => '既存の書類項目があります。生成前に重複を確認してください。'];
        }
        if ($deletedGenerated > 0) {
            $warnings[] = ['code' => 'deleted_generated_items_present', 'message' => '削除済みの生成項目は再作成されません。必要に応じて履歴を確認してください。'];
        }
        $purposeCounts = [];
        foreach ($candidates as $candidate) {
            foreach ($candidate['purpose_ids'] as $id) {
                $purposeCounts[$id] = ($purposeCounts[$id] ?? 0) + 1;
            }
        }
        $missing = count(array_filter($candidates, fn ($candidate) => ! $candidate['represented']));

        return [
            'case' => ['id' => $case->id, 'case_type' => $type ? ['id' => $type->id, 'name' => $type->name] : null],
            'initialization' => [
                'available' => $type !== null, 'candidate_count' => count($candidates),
                'existing_generated_count' => $active->where('is_template_generated', true)->count(),
                'missing_candidate_count' => $missing, 'skipped_candidate_count' => count($candidates) - $missing,
                'manual_item_count' => $manual, 'total_existing_collection_items' => $active->count(),
                'legacy_item_count' => $legacy, 'soft_deleted_generated_count' => $deletedGenerated,
            ],
            'purposes' => DocumentPurpose::on($connection)->whereIn('id', array_keys($purposeCounts))
                ->orderBy('sort_order')->orderBy('id')->get(['id', 'code', 'name_ja'])
                ->map(fn ($purpose) => ['code' => $purpose->code, 'name_ja' => $purpose->name_ja,
                    'candidate_count' => $purposeCounts[$purpose->id]])->all(),
            'warnings' => $warnings,
        ];
    }

    /** Both consumers use identical inheritance, manual matching and metadata safety checks. */
    private function plan(CaseFile $case, bool $locking): array
    {
        $connection = $case->getConnectionName();
        $candidates = [];
        if ($case->case_type_id !== null) {
            $lineage = $this->lineage((int) $case->case_type_id, $connection);
            $date = today()->toDateString();
            $rules = CaseTypeDocumentRule::on($connection)->with(['documentType', 'purposes'])
                ->whereIn('case_type_id', $lineage)->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('effective_from')->orWhereDate('effective_from', '<=', $date))
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date))
                ->orderByDesc('version')->orderBy('id')->get();
            foreach ($lineage as $typeId) {
                // Nearest level wins metadata; only latest effective versions contribute purposes.
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
        }
        $query = $case->documents()->withTrashed();
        if ($locking) {
            // A current locking read sees the prior initialization's committed items on MySQL.
            $query->lockForUpdate();
        }
        $existing = $query->get();
        foreach ($candidates as &$candidate) {
            $rule = $candidate['rule'];
            $candidate['represented'] = $this->alreadyRepresented($existing, $rule);
            if ($candidate['represented']) {
                continue;
            }
            if (! $rule->documentType) {
                throw new ChecklistPlanningException("Document definition missing for rule {$rule->id}.");
            }
            // Master TEXT must fit the existing case VARCHAR(255) suggestions without truncation.
            foreach (['standard_source', 'standard_target_person'] as $field) {
                if (mb_strlen((string) $rule->$field) > 255) {
                    throw new ChecklistPlanningException("Rule {$rule->id} {$field} exceeds the case field capacity.");
                }
            }
            if (! in_array($rule->priority_default, CaseDocument::COLLECTION_PRIORITIES, true)) {
                throw new ChecklistPlanningException("Unsupported collection priority on rule {$rule->id}.");
            }
        }
        unset($candidate);

        return compact('candidates', 'existing');
    }

    /** @return list<int> Selected type first, root last. */
    private function lineage(int $selectedId, ?string $connection): array
    {
        $lineage = [];
        $seen = [];
        $id = $selectedId;
        while ($id !== null) {
            if (isset($seen[$id])) {
                throw new ChecklistPlanningException("Cyclic case type hierarchy at case type {$id}.");
            }
            $seen[$id] = true;
            $type = CaseType::on($connection)->find($id);
            if (! $type) {
                throw new ChecklistPlanningException("Invalid case type hierarchy: missing case type {$id}.");
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
