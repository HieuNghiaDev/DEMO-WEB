<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ChatRoom extends Model
{
    protected $fillable = ['singleton_slot', 'office_id', 'kind', 'name'];

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }

    public function readStates(): HasMany
    {
        return $this->hasMany(ChatReadState::class);
    }
}
