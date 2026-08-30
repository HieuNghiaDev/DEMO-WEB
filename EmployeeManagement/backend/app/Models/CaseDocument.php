<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseDocument extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'case_file_id', 'template_item_id', 'category', 'requirement_level', 'title', 'file_url',
        'version', 'status', 'due_at', 'received_at', 'expires_at', 'sort_order',
        'is_template_generated', 'created_by_employee_id', 'created_by_ai_name',
        'confirmed_by_employee_id', 'confirmed_at', 'note',
    ];

    protected function casts(): array
    {
        return [
            'confirmed_at' => 'datetime', 'due_at' => 'date', 'received_at' => 'date',
            'expires_at' => 'date', 'is_template_generated' => 'boolean',
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
}
