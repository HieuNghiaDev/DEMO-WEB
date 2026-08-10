<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Một nhân viên chỉ có một tài khoản
            $table->foreignId('employee_id')
                ->nullable()
                ->unique()
                ->after('id')
                ->constrained('employees')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            // Mã dùng đăng nhập, ví dụ EMP0001
            $table->string('login_id', 50)
                ->nullable()
                ->unique()
                ->after('employee_id');

            // employee, manager, admin
            $table->string('role', 20)
                ->default('employee')
                ->index()
                ->after('password');

            // Cho phép đăng nhập hay không
            $table->boolean('is_active')
                ->default(true)
                ->index()
                ->after('role');

            // Nhân viên phải đổi mật khẩu tạm thời
            $table->boolean('must_change_password')
                ->default(true)
                ->after('is_active');

            // Lần đăng nhập gần nhất
            $table->timestamp('last_login_at')
                ->nullable()
                ->after('must_change_password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('employee_id');

            $table->dropColumn([
                'login_id',
                'role',
                'is_active',
                'must_change_password',
                'last_login_at',
            ]);
        });
    }
};