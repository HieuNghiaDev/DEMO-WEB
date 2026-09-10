<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class DocumentSourceFile extends Model
{
    public const SOURCE_KINDS = ['original', 'derived_template', 'reference'];

    public const STORAGE_PROVIDERS = ['google_drive', 'local_reference'];

    public const SUPPORTED_MIME_TYPES = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
        'text/html',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel.sheet.macroEnabled.12',
    ];

    private const IMMUTABLE_SOURCE_FIELDS = [
        'document_type_id', 'source_version', 'source_kind', 'original_filename', 'mime_type',
        'storage_provider', 'external_file_id', 'external_url', 'local_reference', 'checksum', 'created_by',
    ];

    protected $fillable = [
        'document_type_id', 'source_version', 'source_kind', 'original_filename', 'mime_type',
        'storage_provider', 'external_file_id', 'external_url', 'local_reference', 'checksum',
        'is_active', 'effective_from', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return ['source_version' => 'integer', 'is_active' => 'boolean', 'effective_from' => 'date'];
    }

    protected static function booted(): void
    {
        static::saving(function (DocumentSourceFile $source): void {
            if ($source->source_version < 1
                || ! in_array($source->source_kind, self::SOURCE_KINDS, true)
                || ! in_array($source->storage_provider, self::STORAGE_PROVIDERS, true)
                || ! in_array($source->mime_type, self::SUPPORTED_MIME_TYPES, true)
                || ! is_string($source->original_filename)
                || trim($source->original_filename) === ''
                || preg_match('#[/\\\\]#', $source->original_filename)) {
                throw new LogicException('Document source metadata is invalid.');
            }
            if ($source->storage_provider === 'google_drive'
                && (! is_string($source->external_file_id) || ! preg_match('/^[A-Za-z0-9_-]+$/', $source->external_file_id))) {
                throw new LogicException('A valid Google Drive file ID is required.');
            }
            if ($source->storage_provider === 'local_reference'
                && (! is_string($source->local_reference)
                    || trim($source->local_reference) === ''
                    || preg_match('#(^|/|\\\\)\.\.(/|\\\\|$)#', $source->local_reference)
                    || preg_match('#^(?:[A-Za-z]:[\\\\/]|[/\\\\])#', $source->local_reference))) {
                throw new LogicException('A safe relative local reference is required.');
            }
            if ($source->checksum !== null && ! preg_match('/^[a-f0-9]{64}$/', $source->checksum)) {
                throw new LogicException('Document source checksum must be SHA-256.');
            }
        });

        static::updating(function (DocumentSourceFile $source): void {
            if ($source->isDirty(self::IMMUTABLE_SOURCE_FIELDS)) {
                throw new LogicException('Published document source metadata is immutable; register a new source version.');
            }
        });
    }

    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
