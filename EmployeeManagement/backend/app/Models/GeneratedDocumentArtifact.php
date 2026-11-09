<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeneratedDocumentArtifact extends Model
{
    protected static function booted(): void
    {
        static::saving(function (self $artifact): void {
            if (\Illuminate\Support\Facades\Schema::hasTable('c001_legal_decisions')
                && \Illuminate\Support\Facades\DB::table('c001_legal_decisions')->where('case_generated_document_id', $artifact->case_generated_document_id)->exists()) {
                throw new \LogicException('Legally approved artifact is immutable.');
            }
        });
        static::saved(function (self $artifact): void {
            if ($generated = $artifact->generatedDocument()->first()) {
                \App\Services\C001VersionProvenance::record($generated, 'generated', $artifact->uploaded_by);
            }
        });
        static::deleted(function (self $artifact): void {
            if ($generated = $artifact->generatedDocument()->first()) {
                \App\Services\C001VersionProvenance::record($generated, 'artifact_deleted', auth()->id());
            }
        });
    }

    protected $fillable = ['artifact_type', 'storage_provider', 'external_file_id', 'external_url', 'filename', 'mime_type', 'checksum', 'uploaded_by', 'uploaded_at'];

    protected function casts(): array
    {
        return ['uploaded_at' => 'datetime'];
    }

    public function generatedDocument(): BelongsTo
    {
        return $this->belongsTo(CaseGeneratedDocument::class, 'case_generated_document_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
