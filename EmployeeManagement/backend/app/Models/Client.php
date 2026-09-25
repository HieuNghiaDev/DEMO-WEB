<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Client extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'name_vn', 'name_kana', 'client_type', 'address', 'phone',
        'email', 'language', 'nationality', 'notes', 'birth_date',
    ];

    protected function casts(): array
    {
        return ['birth_date' => 'date:Y-m-d'];
    }

    public function caseFiles(): HasMany
    {
        return $this->hasMany(CaseFile::class);
    }

    public function employments(): HasMany
    {
        return $this->hasMany(ClientEmployment::class)
            ->orderByDesc('is_current')
            ->orderByDesc('start_date')
            ->orderByDesc('id');
    }
}
