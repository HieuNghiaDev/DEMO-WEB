<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ReceivedDocument extends Model
{
    use SoftDeletes;

    public const STORAGE_TYPES = ['upload', 'google_drive', 'external_link'];

    public const ORIGINAL_OR_COPY_VALUES = ['original', 'copy'];

    protected $fillable = [
        'review_status', 'reviewed_by', 'reviewed_at', 'review_reason', 'review_detail',
        'case_file_id', 'document_type_id', 'title', 'original_filename', 'storage_type',
        'storage_path', 'external_url', 'version', 'received_at', 'expires_at',
        'original_or_copy', 'return_required', 'returned_at', 'registered_by_employee_id', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
            'version' => 'integer', 'received_at' => 'datetime', 'expires_at' => 'date',
            'return_required' => 'boolean', 'returned_at' => 'datetime',
        ];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }

    public function registeredByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'registered_by_employee_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function caseDocuments(): BelongsToMany
    {
        return $this->belongsToMany(CaseDocument::class, 'case_document_received_documents')
            ->withPivot('relationship_type')->withTimestamps();
    }
}
