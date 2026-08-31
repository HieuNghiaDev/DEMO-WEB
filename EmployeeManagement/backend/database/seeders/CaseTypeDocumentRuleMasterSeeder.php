<?php

namespace Database\Seeders;

use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\DocumentPurpose;
use App\Models\DocumentType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class CaseTypeDocumentRuleMasterSeeder extends Seeder
{
    public const MASTER_SOURCE = 'official-document-collection-v1';

    public function run(): void
    {
        $master = json_decode(file_get_contents(__DIR__.'/data/case_type_document_rule_master_v1.json'), true, 512, JSON_THROW_ON_ERROR);

        DB::transaction(function () use ($master): void {
            $caseTypes = [];
            foreach (['労災', '交通事故'] as $name) {
                // Canonical root identity, never a numeric ID, subtype or legacy 労災事故.
                $matches = CaseType::whereNull('parent_id')->where('name', $name)->get();
                if ($matches->count() !== 1) {
                    throw new RuntimeException("Expected exactly one canonical root case type: {$name}");
                }
                $caseTypes[$name] = $matches->sole()->id;
            }
            $types = DocumentType::pluck('id', 'code');
            $purposes = DocumentPurpose::pluck('id', 'code');
            $seen = [];
            $orders = [];

            foreach ($master['rules'] as $entry) {
                $domain = $entry['case_type'];
                $code = $entry['document_code'];
                $key = $domain.':'.$code.':'.$entry['version'];
                if (isset($seen[$key]) || ! isset($caseTypes[$domain], $types[$code])) {
                    throw new RuntimeException("Duplicate or unresolved official rule: {$key}");
                }
                $seen[$key] = true;
                $purposeIds = [];
                foreach ($entry['purposes'] as $purpose) {
                    if (! isset($purposes[$purpose])) {
                        throw new RuntimeException("Missing official purpose: {$purpose}");
                    }
                    $purposeIds[] = $purposes[$purpose];
                }
                if ($purposeIds === [] || $entry['requirement_level'] !== 'conditional') {
                    throw new RuntimeException("Invalid candidate semantics: {$key}");
                }
                $prerequisite = $entry['prerequisite_code'];
                if ($prerequisite !== null && ! isset($types[$prerequisite])) {
                    throw new RuntimeException("Missing prerequisite code: {$prerequisite}");
                }
                $identity = ['case_type_id' => $caseTypes[$domain], 'document_type_id' => $types[$code], 'version' => $entry['version']];
                $rule = CaseTypeDocumentRule::where($identity)->lockForUpdate()->first();
                if ($rule && $rule->master_source !== self::MASTER_SOURCE) {
                    // An identity collision is not permission to replace a custom rule/purpose set.
                    throw new RuntimeException("Unowned rule identity conflicts with official master: {$key}. No rules were seeded.");
                }
                $rule ??= new CaseTypeDocumentRule($identity);
                $attributes = array_intersect_key($entry, array_flip([
                    'requirement_level', 'applicability_condition', 'standard_source', 'standard_target_person',
                    'standard_period_rule', 'priority_default', 'preservation_priority',
                ]));
                $orders[$domain] = ($orders[$domain] ?? 0) + 1;
                $rule->fill($attributes + [
                    'prerequisite_document_type_id' => $prerequisite === null ? null : $types[$prerequisite],
                    'sort_order' => $orders[$domain], 'is_active' => true,
                ]);
                // Ownership is deliberately not mass-assignable from application input.
                $rule->master_source = self::MASTER_SOURCE;
                $rule->save();
                // Pivot has no per-link ownership. Add missing official links, never detach.
                $rule->purposes()->syncWithoutDetaching($purposeIds);
            }
        });

        $this->command?->info(count($master['rules']).' official candidate rules seeded; no case checklists generated.');
    }
}
