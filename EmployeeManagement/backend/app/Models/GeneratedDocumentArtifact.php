<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeneratedDocumentArtifact extends Model
{
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
