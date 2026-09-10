<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_storage_locations', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 30);
            $table->string('entity_type', 80);
            $table->unsignedBigInteger('entity_id');
            $table->string('location_type', 50);
            $table->string('external_folder_id');
            $table->text('external_url')->nullable();
            $table->string('display_name')->nullable();
            $table->timestamps();

            $table->unique(
                ['provider', 'entity_type', 'entity_id', 'location_type'],
                'external_storage_location_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_storage_locations');
    }
};
