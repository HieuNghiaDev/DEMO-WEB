<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('case_types', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('id')->constrained('case_types')->nullOnDelete();
            $table->text('description')->nullable()->after('name_kana');
        });

        Schema::table('case_files', function (Blueprint $table) {
            $table->string('reference_number', 50)->nullable()->after('title')->index();
            $table->string('priority', 20)->default('normal')->after('status')->index();
            $table->text('summary')->nullable()->after('priority');
            $table->date('opened_at')->nullable()->after('summary');
            $table->date('target_completion_at')->nullable()->after('opened_at');
        });

        Schema::create('document_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_type_id')->constrained('case_types')->cascadeOnUpdate()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedInteger('version')->default(1);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->string('source_reference', 2048)->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->unique(['case_type_id', 'version']);
        });

        Schema::create('document_template_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_template_id')->constrained('document_templates')->cascadeOnDelete();
            $table->string('code', 80);
            $table->string('title');
            $table->string('requirement_level', 20)->default('required')->index();
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['document_template_id', 'code']);
        });

        Schema::table('case_documents', function (Blueprint $table) {
            $table->foreignId('template_item_id')->nullable()->after('case_file_id')->constrained('document_template_items')->nullOnDelete();
            $table->string('requirement_level', 20)->default('optional')->after('category')->index();
            $table->date('due_at')->nullable()->after('status')->index();
            $table->date('received_at')->nullable()->after('due_at');
            $table->date('expires_at')->nullable()->after('received_at')->index();
            $table->unsignedSmallInteger('sort_order')->default(0)->after('expires_at');
            $table->boolean('is_template_generated')->default(false)->after('sort_order');
            $table->softDeletes();
            $table->unique(['case_file_id', 'template_item_id']);
        });

        Schema::create('case_parties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnDelete();
            $table->string('party_type', 30)->index();
            $table->string('name');
            $table->string('organization')->nullable();
            $table->string('relationship')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('case_deadlines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnDelete();
            $table->string('deadline_type', 30)->index();
            $table->string('title');
            $table->dateTime('due_at')->index();
            $table->string('status', 20)->default('open')->index();
            $table->string('priority', 20)->default('normal');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('case_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnDelete();
            $table->foreignId('assigned_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->string('priority', 20)->default('normal');
            $table->dateTime('due_at')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('case_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('case_file_id')->constrained('case_files')->cascadeOnDelete();
            $table->foreignId('created_by_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('activity_type', 30)->index();
            $table->string('channel', 30)->nullable();
            $table->string('title');
            $table->text('content')->nullable();
            $table->dateTime('occurred_at')->index();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('case_activities');
        Schema::dropIfExists('case_tasks');
        Schema::dropIfExists('case_deadlines');
        Schema::dropIfExists('case_parties');

        Schema::table('case_documents', function (Blueprint $table) {
            $table->dropUnique(['case_file_id', 'template_item_id']);
            $table->dropSoftDeletes();
            $table->dropConstrainedForeignId('template_item_id');
            $table->dropColumn(['requirement_level', 'due_at', 'received_at', 'expires_at', 'sort_order', 'is_template_generated']);
        });

        Schema::dropIfExists('document_template_items');
        Schema::dropIfExists('document_templates');

        Schema::table('case_files', function (Blueprint $table) {
            $table->dropColumn(['reference_number', 'priority', 'summary', 'opened_at', 'target_completion_at']);
        });

        Schema::table('case_types', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn('description');
        });
    }
};
