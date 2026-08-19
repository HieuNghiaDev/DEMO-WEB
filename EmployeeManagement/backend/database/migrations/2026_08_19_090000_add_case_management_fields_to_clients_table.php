<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->string('name_kana')->nullable()->after('name_vn');
            $table->string('client_type', 20)->default('individual')->after('name_kana');
            $table->string('address')->nullable()->after('client_type');
            $table->string('nationality', 50)->nullable()->after('language');
            $table->text('notes')->nullable()->after('nationality');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn(['name_kana', 'client_type', 'address', 'nationality', 'notes']);
        });
    }
};
