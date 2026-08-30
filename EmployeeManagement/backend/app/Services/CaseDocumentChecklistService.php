<?php

namespace App\Services;

use App\Models\CaseFile;
use App\Models\DocumentTemplate;
use Illuminate\Support\Facades\DB;

class CaseDocumentChecklistService
{
    public function applyDefaultTemplate(CaseFile $caseFile): int
    {
        if (! $caseFile->case_type_id) {
            return 0;
        }

        $template = DocumentTemplate::query()
            ->with('items')
            ->where('case_type_id', $caseFile->case_type_id)
            ->where('is_active', true)
            ->where(fn ($query) => $query->whereNull('effective_from')->orWhereDate('effective_from', '<=', today()))
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', today()))
            ->orderByDesc('version')
            ->first();

        if (! $template) {
            return 0;
        }

        return DB::transaction(function () use ($caseFile, $template): int {
            $created = 0;

            foreach ($template->items as $item) {
                $document = $caseFile->documents()->withTrashed()->firstOrNew(['template_item_id' => $item->id]);

                if (! $document->exists) {
                    $document->fill([
                        'category' => 'チェックリスト',
                        'requirement_level' => $item->requirement_level,
                        'title' => $item->title,
                        'status' => 'not_requested',
                        'version' => '1',
                        'sort_order' => $item->sort_order,
                        'is_template_generated' => true,
                        'note' => $item->description,
                    ])->save();
                } elseif ($document->trashed()) {
                    $document->restore();
                }

                $created += $document->wasRecentlyCreated || $document->wasChanged('deleted_at') ? 1 : 0;
            }

            return $created;
        });
    }
}
