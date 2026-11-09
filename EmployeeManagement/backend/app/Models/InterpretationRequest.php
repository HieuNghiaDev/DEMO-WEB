<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterpretationRequest extends Model
{
    protected $fillable = ['language', 'work_type', 'mode', 'content', 'starts_at', 'ends_at', 'location', 'notes', 'interpreter_id'];
    protected $hidden = ['request_key', 'creation_hash', 'created_by_user_id', 'updated_by_user_id'];

    protected function casts(): array
    {
        return ['revision' => 'integer'];
    }

    public function caseFile(): BelongsTo { return $this->belongsTo(CaseFile::class); }
    public function interpreter(): BelongsTo { return $this->belongsTo(Interpreter::class); }
}
