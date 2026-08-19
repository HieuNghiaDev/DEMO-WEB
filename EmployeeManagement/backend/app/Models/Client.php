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
        'email', 'language', 'nationality', 'notes',
    ];

    public function matters(): HasMany
    {
        return $this->hasMany(Matter::class);
    }

    public function caseFiles(): HasMany
    {
        return $this->hasMany(CaseFile::class);
    }
}
