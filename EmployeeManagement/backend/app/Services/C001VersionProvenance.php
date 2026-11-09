<?php

namespace App\Services;

use App\Models\CaseGeneratedDocument;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Records server-authenticated contributors. Never backfills historical versions as complete. */
final class C001VersionProvenance
{
    public static function digest(mixed $value): string
    {
        $sort = function (mixed $item) use (&$sort): mixed {
            if (! is_array($item)) return $item;
            if (! array_is_list($item)) ksort($item);
            return array_map($sort, $item);
        };
        return hash('sha256', json_encode($sort($value), JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION));
    }

    public static function content(CaseGeneratedDocument $generated): array
    {
        return ['id' => $generated->id, 'document_id' => $generated->case_document_id, 'version' => $generated->version,
            'template_id' => $generated->document_generation_template_id, 'draft' => $generated->draft_data,
            'fee' => $generated->success_fee_percentage, 'creator' => $generated->created_by, 'editor' => $generated->updated_by,
            'artifacts' => $generated->artifacts()->orderBy('id')->get(['id', 'artifact_type', 'storage_provider', 'external_file_id', 'checksum'])->toArray(),
            'submissions' => $generated->taskSubmissions()->orderBy('id')->get(['id', 'case_task_id', 'case_document_id', 'version', 'source_type', 'submitted_by', 'checksum', 'external_file_id', 'mime_type'])->toArray()];
    }

    public static function record(CaseGeneratedDocument $generated, string $event, ?int $expectedActor): void
    {
        if (! Schema::hasTable('c001_version_provenance') || ! $generated->caseDocument?->documentType()->where('code', 'C-001')->exists()) return;
        DB::transaction(function () use ($generated, $event, $expectedActor): void {
            $generated = CaseGeneratedDocument::whereKey($generated->id)->lockForUpdate()->firstOrFail();
            $actor = auth()->user();
            $actor = $actor instanceof User ? $actor->fresh() : null;
            $trusted = $actor && $actor->id === $expectedActor && $actor->is_active && ! $actor->activation_required
                && $actor->employee?->status === 'active';
            $previous = DB::table('c001_version_provenance')->where('case_generated_document_id', $generated->id)->orderByDesc('sequence')->first();
            $row = ['case_generated_document_id' => $generated->id, 'sequence' => ($previous->sequence ?? 0) + 1,
                'actor_user_id' => $actor?->id, 'actor_employee_id' => $actor?->employee_id, 'event' => $event,
                'content_hash' => self::digest(self::content($generated)), 'previous_hash' => $previous?->entry_hash,
                'trusted' => (bool) $trusted, 'occurred_at' => now()->toDateTimeString()];
            DB::table('c001_version_provenance')->insert([...$row, 'entry_hash' => self::digest($row)]);
        });
    }

    public static function ledger(CaseGeneratedDocument $generated): array
    {
        abort_unless(Schema::hasTable('c001_version_provenance'), 409, 'Trusted provenance is unavailable.');
        $rows = DB::table('c001_version_provenance')->where('case_generated_document_id', $generated->id)->orderBy('sequence')->get();
        abort_unless($rows->isNotEmpty() && $rows->first()->event === 'created', 409, 'Version provenance is incomplete.');
        $hash = null; $sequence = 0; $actors = []; $employees = [];
        foreach ($rows as $record) {
            $row = (array) $record; unset($row['id'], $row['entry_hash']);
            foreach (['case_generated_document_id', 'sequence', 'actor_user_id', 'actor_employee_id'] as $field) {
                if ($row[$field] !== null) $row[$field] = (int) $row[$field];
            }
            $row['trusted'] = (bool) $row['trusted'];
            abort_unless($record->trusted && $record->actor_user_id && $record->actor_employee_id
                && (int) $record->sequence === ++$sequence && $record->previous_hash === $hash
                && hash_equals($record->entry_hash, self::digest($row)), 409, 'Version provenance is incomplete.');
            $hash = $record->entry_hash; $actors[] = (int) $record->actor_user_id; $employees[] = (int) $record->actor_employee_id;
        }
        abort_unless(hash_equals($rows->last()->content_hash, self::digest(self::content($generated->fresh()))), 409, 'Unrecorded content change.');
        return ['head' => $hash, 'actors' => array_values(array_unique($actors)), 'employees' => array_values(array_unique($employees))];
    }
}
