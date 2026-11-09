<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CaseTaskSubmission extends Model
{
    protected static function booted(): void
    {
        static::saved(function (self $submission): void {
            if ($submission->wasRecentlyCreated || $submission->wasChanged(['case_task_id', 'case_document_id', 'case_generated_document_id',
                'version', 'checksum', 'submitted_by', 'source_type', 'external_file_id', 'mime_type'])) {
                if ($generated = $submission->generatedDocument()->first()) {
                    \App\Services\C001VersionProvenance::record($generated, 'submitted', $submission->submitted_by);
                }
            }
        });
        static::deleted(function (self $submission): void {
            if ($generated = $submission->generatedDocument()->first()) {
                \App\Services\C001VersionProvenance::record($generated, 'submission_deleted', auth()->id());
            }
        });
    }

    public const REVIEW_STATUSES = ['pending_review', 'approved', 'rejected'];

    public const SOURCE_TYPES = ['manual_upload', 'auto_generated'];

    protected $fillable = [
        'received_document_id', 'review_reason', 'review_detail',
        'case_task_id', 'case_document_id', 'case_generated_document_id', 'version',
        'source_type', 'review_status', 'storage_provider', 'external_file_id',
        'external_url', 'filename', 'mime_type', 'checksum', 'submitted_by',
        'submitted_at', 'reviewed_by', 'reviewed_at', 'review_note',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(CaseTask::class, 'case_task_id');
    }

    public function caseDocument(): BelongsTo
    {
        return $this->belongsTo(CaseDocument::class);
    }

    public function generatedDocument(): BelongsTo
    {
        return $this->belongsTo(CaseGeneratedDocument::class, 'case_generated_document_id');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
