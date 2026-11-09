<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('received_documents', function (Blueprint $table) {
            // Null preserves legacy files: their previous review is not inferred.
            $table->string('review_status', 30)->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('review_reason')->nullable();
            $table->text('review_detail')->nullable();
        });
        Schema::table('case_task_submissions', function (Blueprint $table) {
            $table->foreignId('received_document_id')->nullable()->constrained('received_documents')->restrictOnDelete();
            $table->string('review_reason')->nullable();
            $table->text('review_detail')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('case_task_submissions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('received_document_id');
            $table->dropColumn(['review_reason', 'review_detail']);
        });
        Schema::table('received_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['review_status', 'reviewed_at', 'review_reason', 'review_detail']);
        });
    }
};
