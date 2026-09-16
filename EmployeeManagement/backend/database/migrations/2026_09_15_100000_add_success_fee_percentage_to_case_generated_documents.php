<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_generated_documents', function (Blueprint $table) {
            $table->decimal('success_fee_percentage', 5, 2)->nullable()->after('approved_data');
        });
    }

    public function down(): void
    {
        Schema::table('case_generated_documents', function (Blueprint $table) {
            $table->dropColumn('success_fee_percentage');
        });
    }
};
