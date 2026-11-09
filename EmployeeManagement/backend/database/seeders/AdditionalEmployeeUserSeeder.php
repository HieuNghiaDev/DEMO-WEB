<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/** Retired identity writer: local databases can contain real users too. */
class AdditionalEmployeeUserSeeder extends Seeder
{
    public function run(): void
    {
        $this->command?->warn('Legacy identity seeding is disabled. Use approved account activation or explicit synthetic test factories.');
    }
}
