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
    }

    public function down(): void
    {
        throw new LogicException('No automatic staging rollback.');
    }
};
