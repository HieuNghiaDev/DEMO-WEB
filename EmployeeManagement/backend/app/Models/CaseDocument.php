<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseDocument extends Model
{
    use SoftDeletes;

    // toArray already removes these private relations. Hide them before Eloquent
    // serializes their task capabilities, not after doing that unused work.
    protected $hidden = ['activeCaseTask', 'latestCaseTask', 'latestEmployeeTask'];

    // Separate axes for future collection workflows; legacy status is not synchronized.
    public const NECESSITY_STATUSES = ['undetermined', 'required', 'not_required'];

    public const COLLECTION_STATUSES = ['not_started', 'preparing', 'requested', 'partially_received', 'received', 'difficult', 'closed'];

    public const COLLECTION_RESULTS = ['not_exist', 'not_disclosed', 'partially_disclosed', 'custodian_unknown', 'other'];

    public const FULFILLMENT_STATUSES = ['undetermined', 'insufficient', 'satisfied', 'satisfied_by_alternative'];

    public const REVIEW_STATUSES = ['unreviewed', 'reviewing', 'reviewed', 'returned'];

    public const COLLECTION_PRIORITIES = ['low', 'normal', 'high', 'critical'];

    protected $fillable = [
        'case_file_id', 'template_item_id', 'category', 'requirement_level', 'title', 'file_url',
        'version', 'status', 'due_at', 'received_at', 'expires_at', 'sort_order',
        'is_template_generated', 'created_by_employee_id', 'created_by_ai_name',
        'confirmed_by_employee_id', 'confirmed_at', 'note',
        'document_type_id', 'case_type_document_rule_id', 'target_person', 'collection_source',
        'rule_version_snapshot', 'applicability_condition_snapshot', 'rule_source_snapshot',
        'target_period_from', 'target_period_to', 'target_scope', 'necessity_status', 'necessity_reason',
        'necessity_decided_by_employee_id', 'necessity_decided_at', 'collection_status',
        'collection_result', 'collection_method',
        'fulfillment_status', 'review_status', 'assigned_employee_id', 'requested_at',
        'response_deadline', 'collection_priority', 'preservation_priority', 'preservation_reason',
    ];

    protected function casts(): array
    {
        return [
            'confirmed_at' => 'datetime', 'due_at' => 'date', 'received_at' => 'date',
            'expires_at' => 'date', 'is_template_generated' => 'boolean',
            'target_period_from' => 'date', 'target_period_to' => 'date',
            'necessity_decided_at' => 'datetime', 'requested_at' => 'datetime',
            'response_deadline' => 'datetime',
            'rule_version_snapshot' => 'integer',
            'preservation_priority' => 'boolean',
        ];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }

    public function confirmedByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'confirmed_by_employee_id');
    }

    public function templateItem(): BelongsTo
    {
        return $this->belongsTo(DocumentTemplateItem::class, 'template_item_id');
    }

    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }

    public function collectionRule(): BelongsTo
    {
        return $this->belongsTo(CaseTypeDocumentRule::class, 'case_type_document_rule_id');
    }

    public function receivedDocuments(): BelongsToMany
    {
        // file_url remains the legacy link; no automatic conversion or dual write.
        return $this->belongsToMany(ReceivedDocument::class, 'case_document_received_documents')
            ->withPivot('relationship_type')->withTimestamps();
    }

    public function assignedEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'assigned_employee_id');
    }

    public function employeeTasks(): HasMany
    {
        return $this->hasMany(EmployeeTask::class);
    }

    public function caseTasks(): HasMany
    {
        return $this->hasMany(CaseTask::class);
    }

    public function taskSubmissions(): HasMany
    {
        return $this->hasMany(CaseTaskSubmission::class)->orderByDesc('version');
    }

    public function latestTaskSubmission(): HasOne
    {
        return $this->hasOne(CaseTaskSubmission::class)->latestOfMany('version');
    }

    public function activeCaseTask(): HasOne
    {
        return $this->hasOne(CaseTask::class)
            ->ofMany(['id' => 'max'], fn ($query) => $query->whereIn('status', CaseTask::ACTIVE_STATUSES));
    }

    public function latestCaseTask(): HasOne
    {
        return $this->hasOne(CaseTask::class)->withTrashed()->latestOfMany();
    }

    public function latestEmployeeTask(): HasOne
    {
        return $this->hasOne(EmployeeTask::class)->latestOfMany();
    }

    public function taskMetadataVisibleTo(?User $user): bool
    {
        $task = $this->activeCaseTask ?? $this->latestCaseTask;
        if ($task !== null && ! CaseTask::withTrashed()->visibleTo($user)->whereKey($task->id)->exists()) {
            return false;
        }
        $employeeTask = $this->latestEmployeeTask;

        return $employeeTask === null || $employeeTask->isVisibleTo($user);
    }

    /** Prevent assignment/deadline filters from disclosing a private linked task. */
    public function scopeWithVisibleTaskMetadata(Builder $query, ?User $user): Builder
    {
        return $query->where(fn ($q) => $q
            ->whereHas('activeCaseTask', fn ($task) => $task->visibleTo($user))
            ->orWhere(fn ($inactive) => $inactive->whereDoesntHave('activeCaseTask')
                ->where(fn ($latest) => $latest->whereDoesntHave('latestCaseTask')
                    ->orWhereHas('latestCaseTask', fn ($task) => $task->visibleTo($user)))))
            ->where(fn ($q) => $q->whereDoesntHave('latestEmployeeTask')
                ->orWhereHas('latestEmployeeTask', fn ($task) => $task->visibleTo($user)));
    }

    /** Raw workspace/document responses must not bypass the collection resource. */
    public function toArray(): array
    {
        $data = parent::toArray();
        unset($data['active_case_task'], $data['latest_case_task'], $data['latest_employee_task']);
        if (! $this->taskMetadataVisibleTo(auth()->user())) {
            foreach (['assigned_employee_id', 'assigned_employee', 'response_deadline', 'active_case_task'] as $field) {
                if (array_key_exists($field, $data)) {
                    $data[$field] = null;
                }
            }
        }

        return $data;
    }

    public function generatedDocument(): HasOne
    {
        // Compatibility relation used by collection resources; mutations use generatedDocuments().
        return $this->hasOne(CaseGeneratedDocument::class)->orderByDesc('version')->orderByDesc('id');
    }

    public function generatedDocuments(): HasMany
    {
        return $this->hasMany(CaseGeneratedDocument::class);
    }

    public function necessityDecidedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'necessity_decided_by_employee_id');
    }

    public function purposes(): BelongsToMany
    {
        // Case purposes are independent of rule purposes, not a live inherited list.
        return $this->belongsToMany(DocumentPurpose::class, 'case_document_purposes')
            ->withTimestamps()->orderBy('document_purposes.sort_order');
    }
}
