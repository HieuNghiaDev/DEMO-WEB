<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SecretaryLog extends Model
{
    protected $fillable = ['skill_name', 'trigger_type', 'input', 'output', 'status'];

    protected function casts(): array
    {
        return ['input' => 'array', 'output' => 'array'];
    }
}
