<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Never merge/delete existing rules or their checklist references to make an index fit.
        $duplicate = DB::table('case_type_document_rules')
            ->select('case_type_id', 'document_type_id', 'version')
            ->groupBy('case_type_id', 'document_type_id', 'version')
            ->havingRaw('COUNT(*) > 1')->exists();
        if ($duplicate) {
            throw new RuntimeException('Duplicate document rule identities exist; review them before migrating. No rules were changed.');
        }

        Schema::table('case_type_document_rules', function (Blueprint $table) {
            // Null means custom/unclaimed; the seeder must not adopt such a row.
            $table->string('master_source', 100)->nullable();
            $table->unique(['case_type_id', 'document_type_id', 'version'], 'ctdr_identity_unique');
        });
    }

    public function down(): void
    {
        Schema::table('case_type_document_rules', function (Blueprint $table) {
            $table->dropUnique('ctdr_identity_unique');
            $table->dropColumn('master_source');
        });
    }
};
