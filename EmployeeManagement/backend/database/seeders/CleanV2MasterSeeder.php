<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CleanV2MasterSeeder extends Seeder
{
    public function run(): void
    {
        // Business masters remain independent from runtime authority and account provisioning.
        if (! DB::table('offices')->exists()) {
            $this->call(OfficeSeeder::class);
        }
        $this->call(RolePermissionSeeder::class); // Catalog only, even on an empty installation.
        $this->call(TaskVisibilityPermissionSeeder::class);
        $this->call(TaskWorkflowPermissionSeeder::class);
        $this->call([CaseTypeSeeder::class, PersonaSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
        $this->call(DocumentGenerationTemplateSeeder::class);
        if (! DB::table('document_templates')->exists()) {
            $this->call(CaseWorkspaceTemplateSeeder::class);
            // Template bootstrap has its own ordering; keep the canonical tree repeatable.
            $this->call(CaseTypeSeeder::class);
        }
    }
}
