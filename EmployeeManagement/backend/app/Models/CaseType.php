<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CaseType extends Model
{
    protected $fillable = ['name', 'name_kana', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
