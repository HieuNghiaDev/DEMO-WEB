<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // Base64 is intentionally stored in a portable MEDIUMTEXT column.
            // Railway's container filesystem is ephemeral, while its database
            // remains persistent across application redeploys.
            $table->string('avatar_mime_type', 50)->nullable()->after('avatar_path');
            $table->mediumText('avatar_data')->nullable()->after('avatar_mime_type');
            $table->timestamp('avatar_updated_at')->nullable()->after('avatar_data');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'avatar_mime_type',
                'avatar_data',
                'avatar_updated_at',
            ]);
        });
    }
};
