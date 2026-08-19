<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SkillProposal extends Model
{
    protected $fillable = [
        'skill_name', 'current_content', 'proposed_content', 'reason', 'proposed_by',
        'status', 'decided_by', 'decided_at', 'implemented_by', 'implemented_at',
    ];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime', 'implemented_at' => 'datetime'];
    }
}
