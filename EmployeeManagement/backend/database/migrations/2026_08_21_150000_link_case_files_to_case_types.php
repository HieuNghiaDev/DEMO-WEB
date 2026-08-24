<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_files', function (Blueprint $table) {
            $table->foreignId('case_type_id')
                ->nullable()
                ->after('case_type')
                ->constrained('case_types')
                ->nullOnDelete();
            $table->string('case_type_other', 255)
                ->nullable()
                ->after('case_type_id');
        });

        DB::table('case_files')
            ->whereNotNull('case_type')
            ->orderBy('id')
            ->eachById(function (object $caseFile): void {
                $caseTypeId = DB::table('case_types')
                    ->where('name', $caseFile->case_type)
                    ->value('id');

                if ($caseTypeId) {
                    DB::table('case_files')
                        ->where('id', $caseFile->id)
                        ->update(['case_type_id' => $caseTypeId]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('case_files', function (Blueprint $table) {
            $table->dropConstrainedForeignId('case_type_id');
            $table->dropColumn('case_type_other');
        });
    }
};
