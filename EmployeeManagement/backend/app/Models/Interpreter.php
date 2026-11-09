<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Interpreter extends Model
{
    protected $guarded = ['*'];
    protected $hidden = ['registration_key', 'registration_hash', 'created_by_user_id'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class)->withTrashed();
    }

    public function available(): bool
    {
        return $this->is_active && ($this->kind === 'external'
            || ($this->kind === 'employee' && $this->employee?->status === 'active' && ! $this->employee->trashed()));
    }

    public function summary(): array
    {
        return ['id' => $this->id, 'kind' => $this->kind,
            'name' => $this->kind === 'employee' ? $this->employee?->full_name : $this->display_name,
            'is_active' => $this->available()];
    }
}
