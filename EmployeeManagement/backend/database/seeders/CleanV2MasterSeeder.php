<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CleanV2MasterSeeder extends Seeder
{
    public function run(): void
    {
        // Bootstrap a new installation without overwriting existing office/RBAC configuration.
        if (! DB::table('offices')->exists()) {
            $this->call(OfficeSeeder::class);
        }
        if (! DB::table('roles')->exists()) {
            $this->call(RolePermissionSeeder::class);
        }
        $this->call([CaseTypeSeeder::class, PersonaSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
        if (! DB::table('document_templates')->exists()) {
            $this->call(CaseWorkspaceTemplateSeeder::class);
            // Template bootstrap has its own ordering; keep the canonical tree repeatable.
            $this->call(CaseTypeSeeder::class);
        }
    }
}
