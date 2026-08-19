<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Persona extends Model
{
    protected $fillable = ['name', 'display_name', 'skills', 'active'];

    protected function casts(): array
    {
        return ['skills' => 'array', 'active' => 'boolean'];
    }
}
