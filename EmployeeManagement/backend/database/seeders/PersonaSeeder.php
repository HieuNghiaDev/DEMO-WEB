<?php

namespace Database\Seeders;

use App\Models\Persona;
use Illuminate\Database\Seeder;

class PersonaSeeder extends Seeder
{
    public function run(): void
    {
        Persona::updateOrCreate(
            ['name' => 'secretary'],
            [
                'display_name' => 'AI 秘書',
                'skills' => ['task_management'],
                'active' => true,
            ]
        );
    }
}
