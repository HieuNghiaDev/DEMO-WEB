<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_administration_state', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->string('phase')->default('preparation');
            $table->boolean('admin_seen')->default(false);
            $table->unsignedBigInteger('revision')->default(0);
        });
        // Lock anchor only: no user/role/permission grants and no authority-mode cutover.
        DB::table('security_administration_state')->insert(['id' => 1, 'phase' => 'preparation', 'admin_seen' => false, 'revision' => 0]);
    }

    public function down(): void
    {
        Schema::dropIfExists('security_administration_state');
    }
};
