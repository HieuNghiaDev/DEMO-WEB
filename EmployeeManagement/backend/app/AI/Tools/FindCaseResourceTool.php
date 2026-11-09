<?php

namespace App\AI\Tools;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\User;
use App\Services\C001DocumentWorkflowService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/** Local AI tool: only the current authenticated request may invoke it. */
final class FindCaseResourceTool
{
    private const LIMIT = 6;

    private const ALIASES = [
        'hop dong uy quyen' => '委任契約書',
        'giay uy quyen' => '委任状',
        'hoa don' => '請求書',
        'giay to cu tru' => '在留関係書類',
        'ho so uy quyen' => 'ủy quyền',
        'uy quyen' => 'ủy quyền',
    ];

    public function run(User $actor, string $message, ?int $contextCaseId): ?array
    {
        $intent = $this->intent($message);
        if ($intent === null) {
            return null;
        }
        [$subject, $document, $latest, $version, $open] = $intent;
        $cases = CaseFile::query()->visibleTo($actor);
        $clientMatch = function (Builder $query, bool $partial) use ($subject): void {
            $query->where(fn (Builder $q) => $this->match($q, ['name', 'name_vn', 'name_kana'], [$subject], $partial));
        };
        $partial = false;
        if (preg_match('/^CASE-(\d+)$/i', $subject, $code)) {
            $exact = (clone $cases)->where('reference_number', strtoupper($subject));
            $digits = ltrim($code[1], '0');
            if ($exact->exists() || $digits === '' || strlen($digits) > 15) {
                $cases = $exact;
            } else {
                // The workspace displays CASE-%06d for rows without a stored
                // reference. Resolve that display code without using the raw ID
                // to match a case that has a different explicit reference.
                $displayCode = sprintf('CASE-%06d', (int) $digits);
                $cases->where(fn (Builder $q) => $q->where('reference_number', $displayCode)
                    ->orWhere(fn (Builder $fallback) => $fallback->whereKey((int) $digits)
                        ->where(fn (Builder $blank) => $blank->whereNull('reference_number')->orWhere('reference_number', ''))));
            }
        } elseif ($subject !== '') {
            $exact = (clone $cases)->whereHas('client', fn (Builder $q) => $clientMatch($q, false));
            if ($exact->exists()) {
                $cases = $exact;
            } else {
                $title = (clone $cases)->where(fn (Builder $q) => $this->match($q, ['title'], [$subject], false));
                if ($title->exists()) {
                    $cases = $title;
                } elseif (mb_strlen($subject) >= 2) {
                    $partial = true;
                    $cases->where(fn (Builder $q) => $q
                        ->whereHas('client', fn (Builder $client) => $clientMatch($client, true))
                        ->orWhere(fn (Builder $name) => $this->match($name, ['title'], [$subject], true)));
                } else {
                    $cases->whereRaw('1 = 0');
                }
            }
        } elseif ($contextCaseId !== null && $document !== null) {
            $cases->whereKey($contextCaseId);
        } else {
            return $this->result($actor, 'clarify');
        }

        $cases = $cases->select(['id', 'client_id', 'reference_number', 'title', 'case_type', 'opened_at'])
            ->with('client:id,name,name_vn')
            ->latest('opened_at')->orderByDesc('id')->limit(self::LIMIT + 1)->get();
        if ($cases->isEmpty()) {
            return $this->result($actor, 'not_found');
        }
        if ($document !== null && $cases->count() === 1) {
            $result = $this->documents($actor, $cases->first(), $document, $latest, $version, $open && ! $partial);

            return $this->result($actor, $result['status'], $result['options']);
        }
        if ($document !== null && $document !== '') {
            $options = [];
            $needsRefinement = $cases->count() > self::LIMIT;
            foreach ($cases->take(self::LIMIT) as $case) {
                $result = $this->documents($actor, $case, $document, $latest, $version, false);
                $needsRefinement = $needsRefinement || $result['status'] === 'clarify';
                array_push($options, ...$result['options']);
                if (count($options) >= self::LIMIT) break;
            }

            if ($options !== []) {
                return $this->result($actor, 'choose', array_slice($options, 0, self::LIMIT));
            }

            return $this->result($actor, $needsRefinement ? 'clarify' : 'not_found');
        }

        $caseOptions = $cases->take(self::LIMIT)->map(fn (CaseFile $case) => [
            'action' => 'open_case', 'case_id' => $case->id,
            'client_name' => $this->clientName($case),
            'case_code' => $this->caseCode($case),
            'title' => $case->title,
            'details' => implode(' · ', array_filter([$case->case_type, $case->opened_at?->toDateString()])),
            'label' => implode(' · ', array_filter([$this->caseCode($case),
                $case->title, $case->case_type, $case->opened_at?->toDateString()])),
        ])->all();

        return $this->result($actor, $open && count($caseOptions) === 1 && ! $partial ? 'open' : 'choose', $caseOptions);
    }

    /** A navigation command is handled before the provider; chat history cannot supply actions. */
    private function intent(string $message): ?array
    {
        $message = preg_replace('/[?.!。！？]+$/u', '', trim($message));
        if (mb_strlen($message) > 200 || preg_match('/[\r\n]/', $message)) {
            return null;
        }
        $japanese = false;
        if (preg_match('/^(?:(?:h[ãa]y|gi[úu]p t[ôo]i)\s+)?(m[ởo]|xem|t[ìi]m(?: ki[ếe]m)?)\s+(.+)$/iu', $message, $parts)) {
            $body = $parts[2];
            $open = ! str_starts_with(strtolower(Str::ascii($parts[1])), 'tim');
            $subject = '';
            if (preg_match('/^(.+?)\s+(?:c[ủu]a|trong\s+(?:h[ồo] s[ơo]|v[ụu] [áa]n)(?:\s+c[ủu]a)?)\s+(.+)$/iu', $body, $split)) {
                [, $body, $subject] = $split;
            }
            if (preg_match('/^(?:h[ồo] s[ơo]|v[ụu] [áa]n)(?:\s+(?![ủu]y quy[ềe]n\b)(.+))?$/iu', $body, $case)) {
                return [$this->clientSubject($subject ?: ($case[1] ?? '')), null, false, null, $open];
            }
            $subject = $this->clientSubject($subject);
        } elseif (preg_match('/^(?:(.+?)を)?(開いて(?:ください)?|見せて(?:ください)?|探して(?:ください)?)$/u', $message, $parts) && ($parts[1] ?? '') !== '') {
            $japanese = true;
            $body = $parts[1];
            $open = ! str_starts_with($parts[2], '探して');
            $subject = '';
            if (preg_match('/^(.+?)の(.+)$/u', $body, $split)) {
                $subject = preg_replace('/さん$/u', '', trim($split[1]));
                $body = $split[2];
            }
            if (in_array($body, ['案件', '事件'], true)) {
                return [$subject, null, false, null, $open];
            }
            if ($subject === '' && preg_match('/^案件\s*(.+)$/u', $body, $case)) {
                return [trim($case[1]), null, false, null, $open];
            }
        } else {
            return null;
        }

        if ($subject === '' && preg_match('/^CASE-\d+$/i', $body)) {
            return [$body, null, false, null, $open];
        }
        $latestPattern = '/m[ớo]i nh[ấa]t|g[ầa]n nh[ấa]t|最新(?:の)?/iu';
        $latest = preg_match($latestPattern, $body) === 1;
        $body = trim(preg_replace($latestPattern, '', $body));
        $version = null;
        if (preg_match('/\s+v([1-9]\d{0,8})$/i', $body, $number)) {
            $version = (int) $number[1];
            $body = trim(substr($body, 0, -strlen($number[0])));
        }
        if (preg_match('/^(?:タスク|仕事|c[ôo]ng vi[ệe]c|nhi[ệe]m v[ụu])/iu', $body)) {
            return null;
        }
        $title = trim(preg_replace('/^(?:t[àa]i li[ệe]u|file|資料|書類|ファイル)\s+/iu', '', $body));
        $document = self::ALIASES[strtolower(Str::ascii($title))] ?? $title;
        if ($document === $title && ($subject === '' || $japanese)
            && ! preg_match('/^(?:t[àa]i li[ệe]u|file|資料|書類|ファイル)|委任|請求書|在留関係書類|^[A-Z]-\d+\b|\.(?:pdf|docx?|xlsx?|png|jpe?g)$/iu', $body)) {
            return null;
        }
        if (in_array(mb_strtolower($document), ['tài liệu', 'tai lieu', 'file', '資料', '書類', 'ファイル'], true)) {
            $document = '';
        }

        return [trim($subject), $document, $latest, $version, $open];
    }

    private function clientSubject(string $subject): string
    {
        return trim(preg_replace('/^kh[áa]ch h[àa]ng\s+/iu', '', trim($subject)));
    }

    private function caseCode(CaseFile $case): string
    {
        return $case->reference_number ?: sprintf('CASE-%06d', $case->id);
    }

    private function clientName(CaseFile $case): ?string
    {
        return trim((string) $case->client?->name_vn) ?: (trim((string) $case->client?->name) ?: null);
    }

    private function documents(User $actor, CaseFile $case, string $term, bool $latest, ?int $version, bool $open): array
    {
        if ($term === '' && ! $latest) {
            return ['status' => 'clarify', 'options' => []];
        }
        $caseId = $case->id;
        $caseCode = $this->caseCode($case);
        $clientName = $this->clientName($case);
        // Same parent-case read gate as the collection API. Never search task
        // descriptions or task-only submission metadata.
        $base = CaseDocument::query()->where('case_file_id', $caseId)
            ->whereHas('caseFile', fn (Builder $q) => $q->visibleTo($actor));
        $eligibleFiles = fn (Builder $q) => $q->where('received_documents.case_file_id', $caseId)
            ->where(fn (Builder $file) => $file
                ->where(fn (Builder $upload) => $upload->where('storage_type', 'upload')->whereNotNull('storage_path'))
                ->orWhere(fn (Builder $external) => $external->whereIn('storage_type', ['google_drive', 'external_link'])->whereNotNull('external_url')));
        $isC001 = fn (Builder $q) => $q->where('code', 'C-001');
        // Match the two existing PDF readers: stored official C001 PDFs, or
        // renderable approved generic snapshots. Drafts without a file aren't results.
        $eligibleVersions = fn (Builder $q) => $q->where(fn (Builder $versions) => $versions
            ->where(fn (Builder $official) => $official->whereHas('caseDocument.documentType', $isC001)
                ->whereHas('artifacts', fn (Builder $a) => $a->where('artifact_type', C001DocumentWorkflowService::PDF_ARTIFACT_TYPE)
                    ->where('storage_provider', 'google_drive')->where('external_file_id', '<>', '')))
            ->orWhere(fn (Builder $generic) => $generic->whereDoesntHave('caseDocument.documentType', $isC001)
                ->where('workflow_status', 'approved')->whereNotNull('approved_data')
                ->whereHas('template', fn (Builder $t) => $t->where('renderer_type', 'generic_legal_document'))
                ->whereHas('artifacts', fn (Builder $a) => $a->where('mime_type', 'application/pdf'))));
        $fileMatch = fn (Builder $q, bool $partial) => $q->where(fn (Builder $f) => $this->match($f, ['received_documents.title', 'original_filename'], [$term], $partial));
        $artifactMatch = fn (Builder $q, bool $partial) => $q->where(fn (Builder $a) => $this->match($a, ['filename'], [$term], $partial));
        $terms = $term === 'ủy quyền' ? ['委任状', '委任契約書'] : [$term];
        $documentMatch = function (Builder $q, bool $partial) use ($terms): void {
            $q->where(fn (Builder $doc) => $this->match($doc, ['title', 'category'], $terms, $partial))
                ->orWhereHas('documentType', function (Builder $type) use ($terms, $partial): void {
                    $type->where(fn (Builder $names) => $this->match($names, ['code', 'name_ja', 'name_vi'], $terms, $partial));
                    if (in_array('委任状', $terms, true) && ! $partial) {
                        $type->orWhere('name_ja', 'like', '委任状（%');
                    }
                });
        };
        $search = function (bool $partial) use ($base, $documentMatch, $fileMatch, $artifactMatch, $eligibleFiles, $eligibleVersions): Builder {
            return (clone $base)->where(fn (Builder $q) => $q
                ->where(fn (Builder $doc) => $documentMatch($doc, $partial))
                ->orWhereHas('receivedDocuments', fn (Builder $file) => $fileMatch($eligibleFiles($file), $partial))
                ->orWhereHas('generatedDocuments', fn (Builder $generated) => $eligibleVersions($generated)
                    ->whereHas('artifacts', fn (Builder $a) => $artifactMatch($a, $partial))));
        };
        $partial = false;
        $query = $term === '' ? clone $base : $search(false);
        if ($term !== '' && ! $query->exists() && mb_strlen($term) >= 2 && ! preg_match('/^[A-Z]-\d+$/i', $term)) {
            $partial = true;
            $query = $search(true);
        }
        $query->where(fn (Builder $q) => $q->whereHas('receivedDocuments', $eligibleFiles)->orWhereHas('generatedDocuments', $eligibleVersions));
        $documents = $query->with('documentType:id,code')->latest('updated_at')->limit(self::LIMIT + 1)->get();
        if ($documents->count() > self::LIMIT && $latest) {
            return ['status' => 'clarify', 'options' => []];
        }
        $candidates = [];
        foreach ($documents->take(self::LIMIT) as $document) {
            $files = $document->receivedDocuments();
            $eligibleFiles($files->getQuery());
            $generated = $document->generatedDocuments();
            $eligibleVersions($generated->getQuery());
            if ($version !== null) {
                $files->where('received_documents.version', $version);
                $generated->where('version', $version);
            }
            if ($term !== '' && ! (clone $base)->whereKey($document->id)->where(fn (Builder $q) => $documentMatch($q, $partial))->exists()) {
                $fileMatch($files->getQuery(), $partial);
                $generated->whereHas('artifacts', fn (Builder $a) => $artifactMatch($a, $partial));
            }
            foreach (['received' => $files, 'generated' => $generated] as $source => $relation) {
                $column = $source === 'received' ? 'received_documents.version' : 'version';
                $rows = $relation->orderByDesc($column)->limit($latest ? 2 : self::LIMIT + 1)->get();
                foreach ($rows as $row) {
                    if ($latest && $row->version !== $rows->first()->version) break;
                    $filename = $source === 'received' ? ($row->original_filename ?: $row->title) : null;
                    $date = $row->updated_at ?? $row->created_at;
                    $details = [$document->documentType?->code, 'v'.$row->version, $date?->toDateString(), $filename];
                    $candidates[] = [
                        'action' => 'open_case_document', 'case_id' => $caseId, 'document_id' => $document->id,
                        'source' => $source, 'document_version_id' => $row->id, 'version' => (int) $row->version,
                        'client_name' => $clientName, 'case_code' => $caseCode, 'title' => $document->title,
                        'details' => implode(' · ', array_filter($details)),
                        'label' => implode(' · ', array_filter([$caseCode, $document->documentType?->code, $document->title,
                            $filename, 'v'.$row->version, $date?->toDateString()])),
                        '_time' => $date?->getTimestamp(),
                        '_type' => $document->document_type_id ?? $document->id.':untyped',
                    ];
                }
            }
        }
        if ($candidates === []) {
            return ['status' => 'not_found', 'options' => []];
        }
        usort($candidates, fn (array $a, array $b) => $b['_time'] <=> $a['_time']);
        // Version numbers are only comparable within one document/source.
        // Across items use timestamps, and keep ties and type ambiguities visible.
        if ($latest && ! $partial && ($term === '' || count(array_unique(array_column($candidates, '_type'))) === 1)
            && $candidates[0]['_time'] !== null) {
            $candidates = array_values(array_filter($candidates, fn ($item) => $item['_time'] === $candidates[0]['_time']));
        }
        $options = array_map(function (array $item): array {
            unset($item['_time'], $item['_type']);

            return $item;
        }, array_slice($candidates, 0, self::LIMIT));

        $status = $open && ! $partial && count($candidates) === 1 && $documents->count() <= self::LIMIT ? 'open' : 'choose';

        return ['status' => $status, 'options' => $options];
    }

    private function match(Builder $query, array $columns, array $values, bool $partial): void
    {
        foreach ($columns as $column) {
            foreach ($values as $value) {
                $lower = mb_strtolower($value);
                $pattern = $partial ? '%'.strtr($lower, ['!' => '!!', '%' => '!%', '_' => '!_']).'%' : $lower;
                $operator = $partial ? "LIKE ? ESCAPE '!'" : '= ?';
                $query->orWhereRaw("LOWER($column) $operator", [$pattern]);
                if (! $partial && $lower !== $value) {
                    $query->orWhere($column, $value);
                }
            }
        }
    }

    private function result(User $actor, string $status, array $options = []): array
    {
        Log::info('AI case navigation resolved', [
            'actor_id' => $actor->id, 'outcome' => $status,
            'targets' => array_map(fn ($item) => array_intersect_key($item, array_flip(['action', 'case_id', 'document_id', 'document_version_id'])), $options),
        ]);

        return ['status' => $status, 'options' => $options];
    }
}
