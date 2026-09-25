<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->date('birth_date')->nullable();
        });

        Schema::table('case_files', function (Blueprint $table) {
            $table->text('incident_summary')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->text('injury_details')->nullable();
            $table->text('incident_location')->nullable();
            $table->text('current_status_memo')->nullable();
        });

        Schema::table('case_parties', function (Blueprint $table) {
            $table->string('entity_type', 40)->nullable()->index();
            $table->string('relation_type', 60)->nullable()->index();
            $table->string('relation_status', 30)->nullable();
            $table->string('contact_person')->nullable();
            $table->string('reference_number')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->boolean('is_current')->nullable()->index();
            $table->jsonb('metadata')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('case_parties', function (Blueprint $table) {
            $table->dropColumn([
                'entity_type', 'relation_type', 'relation_status', 'contact_person',
                'reference_number', 'start_date', 'end_date', 'is_current', 'metadata', 'sort_order',
            ]);
        });
        Schema::table('case_files', function (Blueprint $table) {
            $table->dropColumn([
                'incident_summary', 'occurred_at', 'injury_details', 'incident_location', 'current_status_memo',
            ]);
        });
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('birth_date');
        });
    }
};
