<?php

namespace App\Services;

use App\Models\DocumentSourceFile;
use App\Models\DocumentType;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use SplFileInfo;

class DocumentSourceImportPlanner
{
    private const MIME_BY_EXTENSION = [
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pdf' => 'application/pdf',
        'html' => 'text/html',
        'htm' => 'text/html',
        'txt' => 'text/plain',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xlsm' => 'application/vnd.ms-excel.sheet.macroEnabled.12',
    ];

    /**
     * Build a read-only import plan. Every source must be mapped by exact relative
     * path to a stable document code; filenames are never interpreted as identity.
     *
     * @param  array<int, array{relative_path:mixed, document_code:mixed, source_version:mixed, source_kind?:mixed}>  $mappings
     * @return array<string, mixed>
     */
    public function plan(string $folder, array $mappings): array
    {
        $root = $this->resolveRoot($folder);

        [$mappingByPath, $errors] = $this->validateMappings($mappings);
        $files = $this->enumerate($root);
        $seenPaths = [];
        $seenTargets = [];
        $seenChecksums = [];
        $candidates = [];
        $unmapped = [];
        $unsupported = [];

        $documentTypes = DocumentType::query()
            ->whereIn('code', collect($mappingByPath)->pluck('document_code')->unique()->all())
            ->get(['id', 'code', 'handling_type'])
            ->keyBy('code');

        foreach ($files as $file) {
            $relativePath = $file['relative_path'];
            $seenPaths[$relativePath] = true;
            $extension = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));
            $mimeType = self::MIME_BY_EXTENSION[$extension] ?? null;
            if ($mimeType === null) {
                $unsupported[] = $relativePath;

                continue;
            }

            $mapping = $mappingByPath[$relativePath] ?? null;
            if ($mapping === null) {
                $unmapped[] = $relativePath;

                continue;
            }

            $documentType = $documentTypes->get($mapping['document_code']);
            if (! $documentType) {
                $errors[] = $this->error('unknown_document_code', $relativePath, $mapping['document_code']);

                continue;
            }

            $target = implode(':', [$documentType->id, $mapping['source_version'], $mapping['source_kind']]);
            if (isset($seenTargets[$target])) {
                $errors[] = $this->error('duplicate_target', $relativePath, $seenTargets[$target]);

                continue;
            }
            if (DocumentSourceFile::query()
                ->where('document_type_id', $documentType->id)
                ->where('source_version', $mapping['source_version'])
                ->where('source_kind', $mapping['source_kind'])
                ->exists()) {
                $errors[] = $this->error('target_already_registered', $relativePath, $mapping['document_code']);

                continue;
            }
            $seenTargets[$target] = $relativePath;

            $checksum = hash_file('sha256', $file['absolute_path']);
            if (! is_string($checksum)) {
                $errors[] = $this->error('checksum_failed', $relativePath);

                continue;
            }
            $duplicatePath = $seenChecksums[$checksum]
                ?? DocumentSourceFile::query()->where('checksum', $checksum)->value('original_filename');
            if ($duplicatePath !== null) {
                $errors[] = $this->error('duplicate_checksum', $relativePath, $duplicatePath);

                continue;
            }
            $seenChecksums[$checksum] = $relativePath;

            $candidates[] = [
                'document_type_id' => $documentType->id,
                'document_code' => $documentType->code,
                'handling_type' => $documentType->handling_type,
                'source_version' => $mapping['source_version'],
                'source_kind' => $mapping['source_kind'],
                'original_filename' => basename($relativePath),
                'mime_type' => $mimeType,
                'storage_provider' => 'local_reference',
                'local_reference' => $relativePath,
                'checksum' => $checksum,
            ];
        }

        foreach (array_keys($mappingByPath) as $mappedPath) {
            if (! isset($seenPaths[$mappedPath])) {
                $errors[] = $this->error('mapped_file_missing', $mappedPath);
            }
        }

        sort($unmapped);
        sort($unsupported);

        return [
            'ready' => $errors === [] && $unmapped === [] && $unsupported === [],
            'root' => $root,
            'candidates' => $candidates,
            'unmapped' => $unmapped,
            'unsupported' => $unsupported,
            'errors' => $errors,
            'summary' => [
                'files' => count($files),
                'candidates' => count($candidates),
                'unmapped' => count($unmapped),
                'unsupported' => count($unsupported),
                'errors' => count($errors),
            ],
        ];
    }

    /**
     * Produce advisory code candidates from exact stable-code tokens in paths.
     * A proposal is never accepted as identity until the operator supplies it
     * back to plan() in the deterministic mapping manifest.
     *
     * @return array<int, array<string, mixed>>
     */
    public function proposeMappings(string $folder): array
    {
        $root = $this->resolveRoot($folder);
        $codes = DocumentType::query()->orderBy('code')->pluck('code')->all();

        return collect($this->enumerate($root))->map(function (array $file) use ($codes): array {
            $relativePath = $file['relative_path'];
            $extension = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));
            $matches = array_values(array_filter($codes, function (string $code) use ($relativePath): bool {
                return preg_match(
                    '#(^|[^A-Z0-9])'.preg_quote(strtoupper($code), '#').'([^A-Z0-9]|$)#',
                    strtoupper($relativePath)
                ) === 1;
            }));

            return [
                'relative_path' => $relativePath,
                'original_filename' => basename($relativePath),
                'detected_mime_type' => self::MIME_BY_EXTENSION[$extension] ?? null,
                'document_code_proposal' => count($matches) === 1 ? $matches[0] : null,
                'candidate_codes' => $matches,
                'status' => count($matches) > 1 ? 'ambiguous' : (count($matches) === 1 ? 'proposal' : 'mapping_required'),
                'requires_confirmation' => true,
            ];
        })->all();
    }

    /** @return array<int, array{relative_path:string, absolute_path:string}> */
    public function enumerate(string $root): array
    {
        $files = [];
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (! $file instanceof SplFileInfo || ! $file->isFile() || $file->isLink()) {
                continue;
            }
            $absolutePath = $file->getPathname();
            $relativePath = $this->normalizeRelativePath(substr($absolutePath, strlen($root) + 1));
            $files[] = ['relative_path' => $relativePath, 'absolute_path' => $absolutePath];
        }
        usort($files, fn (array $left, array $right) => $left['relative_path'] <=> $right['relative_path']);

        return $files;
    }

    /** @return array{array<string, array{document_code:string, source_version:int, source_kind:string}>, array<int, array<string, string>>} */
    private function validateMappings(array $mappings): array
    {
        $validated = [];
        $errors = [];
        foreach ($mappings as $mapping) {
            if (! is_array($mapping)) {
                $errors[] = $this->error('invalid_mapping', '');

                continue;
            }
            $path = is_string($mapping['relative_path'] ?? null)
                ? $this->normalizeRelativePath($mapping['relative_path']) : '';
            $code = is_string($mapping['document_code'] ?? null) ? trim($mapping['document_code']) : '';
            $version = filter_var($mapping['source_version'] ?? null, FILTER_VALIDATE_INT);
            $kind = is_string($mapping['source_kind'] ?? null) ? $mapping['source_kind'] : 'original';
            if ($path === '' || $this->isUnsafeRelativePath($path) || $code === '' || $version === false || $version < 1
                || ! in_array($kind, DocumentSourceFile::SOURCE_KINDS, true)) {
                $errors[] = $this->error('invalid_mapping', $path);

                continue;
            }
            if (isset($validated[$path])) {
                $errors[] = $this->error('ambiguous_mapping', $path);

                continue;
            }
            $validated[$path] = [
                'document_code' => $code,
                'source_version' => $version,
                'source_kind' => $kind,
            ];
        }

        return [$validated, $errors];
    }

    private function normalizeRelativePath(string $path): string
    {
        return trim(str_replace('\\', '/', $path), '/');
    }

    private function isUnsafeRelativePath(string $path): bool
    {
        return preg_match('#(^|/)\.\.(/|$)#', $path) === 1
            || preg_match('#^[A-Za-z]:/#', $path) === 1;
    }

    private function resolveRoot(string $folder): string
    {
        $root = realpath($folder);
        if ($root === false || ! is_dir($root)) {
            throw new RuntimeException('Document source folder does not exist.');
        }

        return $root;
    }

    /** @return array<string, string> */
    private function error(string $code, string $path, ?string $detail = null): array
    {
        return array_filter(
            ['code' => $code, 'relative_path' => $path, 'detail' => $detail],
            fn ($value) => $value !== null
        );
    }
}
