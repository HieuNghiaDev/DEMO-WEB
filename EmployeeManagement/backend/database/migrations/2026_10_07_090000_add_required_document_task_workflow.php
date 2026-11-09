<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_tasks', function (Blueprint $table) {
            $table->timestamp('accepted_at')->nullable()->after('due_at');
        });

        Schema::create('case_task_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_task_id')->constrained('case_tasks')->restrictOnDelete();
            $table->foreignId('case_document_id')->constrained('case_documents')->restrictOnDelete();
            $table->foreignId('case_generated_document_id')->nullable()
                ->constrained('case_generated_documents')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->string('source_type', 30);
            $table->string('review_status', 30)->default('pending_review')->index();
            $table->string('storage_provider', 30)->default('google_drive');
            $table->string('external_file_id');
            $table->text('external_url');
            $table->string('filename');
            $table->string('mime_type', 150);
            $table->string('checksum', 64)->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamps();
            $table->unique(['case_document_id', 'version'], 'case_task_submission_document_version_unique');
            $table->index(['case_task_id', 'review_status'], 'case_task_submission_review_index');
        });

        // Existing "pending" rows represented work that had been assigned but not started.
        DB::table('case_tasks')->where('status', 'pending')->update(['status' => 'unaccepted']);
    }

    public function down(): void
    {
        DB::table('case_tasks')->where('status', 'unaccepted')->update(['status' => 'pending']);
        DB::table('case_tasks')->whereIn('status', ['pending_review', 'changes_requested'])
            ->update(['status' => 'in_progress']);

        Schema::dropIfExists('case_task_submissions');
        Schema::table('case_tasks', function (Blueprint $table) {
            $table->dropColumn('accepted_at');
        });
    }
};
