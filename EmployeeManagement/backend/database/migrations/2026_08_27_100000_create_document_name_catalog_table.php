<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_name_catalog', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        foreach (['申請書', 'パスポート写し', '在留カード写し', '住民票', '証明書', '委任状'] as $order => $name) {
            DB::table('document_name_catalog')->insert(['name' => $name, 'sort_order' => $order + 1, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('document_name_catalog');
    }
};
