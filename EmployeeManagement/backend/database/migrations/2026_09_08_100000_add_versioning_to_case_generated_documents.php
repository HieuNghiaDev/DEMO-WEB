<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('case_generated_documents', 'version')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->unsignedInteger('version')->default(1)->after('document_generation_template_id');
            });
        }

        // MySQL may use the old unique index to support the foreign key, so provide a
        // normal FK index before replacing uniqueness with the versioned identity.
        if (! Schema::hasIndex('case_generated_documents', 'case_generated_documents_case_document_id_index')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->index('case_document_id');
            });
        }
        if (Schema::hasIndex('case_generated_documents', 'case_generated_documents_case_document_id_unique')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->dropUnique('case_generated_documents_case_document_id_unique');
            });
        }
        if (! Schema::hasIndex('case_generated_documents', 'case_generated_document_version_unique')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->unique(['case_document_id', 'version'], 'case_generated_document_version_unique');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasIndex('case_generated_documents', 'case_generated_document_version_unique')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->dropUnique('case_generated_document_version_unique');
            });
        }
        if (! Schema::hasIndex('case_generated_documents', 'case_generated_documents_case_document_id_unique')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->unique('case_document_id');
            });
        }
        if (Schema::hasIndex('case_generated_documents', 'case_generated_documents_case_document_id_index')) {
            Schema::table('case_generated_documents', function (Blueprint $table) {
                $table->dropIndex('case_generated_documents_case_document_id_index');
            });
        }

        Schema::table('case_generated_documents', function (Blueprint $table) {
            $table->dropColumn('version');
        });
    }
};
