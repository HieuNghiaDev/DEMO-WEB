<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_documents', function (Blueprint $table) {
            $table->string('collection_result', 30)->nullable();
            $table->text('collection_method')->nullable();
            $table->boolean('preservation_priority')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('case_documents', function (Blueprint $table) {
            $table->dropColumn(['collection_result', 'collection_method', 'preservation_priority']);
        });
    }
};
