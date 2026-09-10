<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExternalStorageLocation extends Model
{
    protected $fillable = [
        'provider',
        'entity_type',
        'entity_id',
        'location_type',
        'external_folder_id',
        'external_url',
        'display_name',
    ];
}
