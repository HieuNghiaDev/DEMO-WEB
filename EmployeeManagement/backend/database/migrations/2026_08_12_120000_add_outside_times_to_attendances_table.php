<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dateTime('outside_start')->nullable()->after('break_end');
            $table->dateTime('outside_expected_end')->nullable()->after('outside_start');
            $table->dateTime('outside_end')->nullable()->after('outside_expected_end');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn([
                'outside_start',
                'outside_expected_end',
                'outside_end',
            ]);
        });
    }
};
