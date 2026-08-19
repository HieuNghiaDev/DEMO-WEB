<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('skill_proposals', function (Blueprint $table) {
            $table->id();
            $table->string('skill_name');
            $table->text('current_content')->nullable();
            $table->text('proposed_content');
            $table->text('reason')->nullable();
            $table->string('proposed_by')->nullable();
            $table->enum('status', [
                'draft',
                'pending_review',
                'approved',
                'returned',
                'rejected',
                'implemented',
            ])->default('draft');
            $table->string('decided_by')->nullable();
            $table->dateTime('decided_at')->nullable();
            $table->string('implemented_by')->nullable();
            $table->dateTime('implemented_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('skill_proposals');
    }
};
