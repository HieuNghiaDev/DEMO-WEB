<?php

namespace App\Services;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;

/** Explicit local rollout DDL, outside the migration chain. Never derives an expected target from .env. */
final class RuntimeCaseAccessSchema
{
    public static function assertTarget(array $expected): void
    {
        if (PHP_SAPI !== 'cli' || ! app()->environment(['local', 'testing'])) throw new LogicException('Local CLI rollout only.');
        $db = DB::connection();
        if ($db->getConfig('url') || $db->getConfig('read') || $db->getConfig('write') || $db->getConfig('unix_socket') || $db->getTablePrefix() !== '') {
            throw new LogicException('URL, replica, socket and prefixed rollout targets are not supported.');
        }
        if ($db->getName() !== ($expected['connection'] ?? null) || $db->getDriverName() !== ($expected['driver'] ?? null)
            || $db->getDatabaseName() !== ($expected['database'] ?? null)) throw new LogicException('Unexpected rollout target.');
        if ($db->getDriverName() === 'sqlite') {
            if (! defined('PHPUNIT_COMPOSER_INSTALL') || ! app()->runningUnitTests() || $db->getDatabaseName() !== ':memory:') {
                throw new LogicException('SQLite rollout verification is PHPUnit RAM only.');
            }
            return;
        }
        if ($expected !== ['connection' => 'mysql', 'driver' => 'mysql', 'host' => '127.0.0.1', 'port' => 3306,
            'database' => 'employee_management'] || $db->getConfig('host') !== $expected['host']
            || (int) $db->getConfig('port') !== $expected['port'] || ! app()->environment('local')) {
            throw new LogicException('Unexpected local MySQL endpoint.');
        }
        $actual = $db->selectOne('SELECT DATABASE() AS db_name, @@port AS db_port');
        if ($actual->db_name !== $expected['database'] || (int) $actual->db_port !== $expected['port']) {
            throw new LogicException('Resolved server target does not match approval.');
        }
    }

    public static function validate(): void
    {
        foreach (['case_files', 'users', 'employees', 'permissions', 'role_permissions', 'security_audit_logs'] as $table) {
            if (! Schema::hasTable($table)) throw new LogicException('Required rollout table missing: '.$table);
        }
        if (Schema::hasColumn('case_files', 'is_confidential')) {
            self::column('case_files', 'is_confidential', ['bool', 'boolean', 'tinyint', 'integer'], true, true);
            if (DB::table('case_files')->whereNotNull('is_confidential')->whereNotIn('is_confidential', [0, 1])->exists()) {
                throw new LogicException('Malformed case classification.');
            }
        }
        if (! Schema::hasTable('case_memberships')) return;
        $columns = ['id', 'case_file_id', 'user_id', 'employee_id', 'can_read', 'can_write', 'can_read_confidential',
            'granted_by', 'evidence_ref', 'expires_at', 'revoked_at', 'revision', 'created_at', 'updated_at'];
        $actual = Schema::getColumnListing('case_memberships');
        sort($columns); sort($actual);
        if ($columns !== $actual) throw new LogicException('Unexpected membership columns.');
        foreach (['id', 'case_file_id', 'user_id', 'employee_id', 'revision'] as $field) {
            self::column('case_memberships', $field, ['integer', 'bigint', 'int'], false);
        }
        self::column('case_memberships', 'granted_by', ['integer', 'bigint', 'int'], true);
        self::column('case_memberships', 'evidence_ref', ['varchar', 'string'], false);
        foreach (['can_read', 'can_write', 'can_read_confidential'] as $field) {
            self::column('case_memberships', $field, ['bool', 'boolean', 'tinyint', 'integer'], false);
            if (self::defaultValue(collect(Schema::getColumns('case_memberships'))->firstWhere('name', $field)['default']) !== '0') {
                throw new LogicException('Membership flags must default to deny.');
            }
        }
        if (self::defaultValue(collect(Schema::getColumns('case_memberships'))->firstWhere('name', 'revision')['default']) !== '1') {
            throw new LogicException('Unexpected membership revision default.');
        }
        foreach (['expires_at', 'revoked_at', 'created_at', 'updated_at'] as $field) {
            self::column('case_memberships', $field, ['datetime', 'timestamp'], true);
        }
        if (! Schema::hasIndex('case_memberships', ['id'], 'primary')
            || ! Schema::hasIndex('case_memberships', ['case_file_id', 'user_id'], 'unique')
            || ! Schema::hasIndex('case_memberships', ['user_id', 'revoked_at', 'expires_at'])) {
            throw new LogicException('Membership indexes do not match the proposal.');
        }
        $foreignKeys = Schema::getForeignKeys('case_memberships');
        foreach (['case_file_id' => 'case_files', 'user_id' => 'users', 'employee_id' => 'employees', 'granted_by' => 'users'] as $column => $table) {
            $valid = collect($foreignKeys)->contains(fn ($fk) => $fk['columns'] === [$column]
                && $fk['foreign_table'] === $table && $fk['foreign_columns'] === ['id']
                && in_array(strtolower($fk['on_delete']), ['restrict', 'no action'], true)
                && in_array(strtolower($fk['on_update']), ['restrict', 'no action'], true));
            if (! $valid) throw new LogicException('Membership foreign key does not preserve evidence: '.$column);
        }
        $members = DB::table('case_memberships as m')->leftJoin('case_files as c', 'c.id', '=', 'm.case_file_id')
            ->leftJoin('users as u', 'u.id', '=', 'm.user_id')->leftJoin('employees as e', 'e.id', '=', 'm.employee_id')
            ->leftJoin('users as issuer', 'issuer.id', '=', 'm.granted_by');
        if ($members->where(fn ($q) => $q->whereNull('c.id')->orWhereNull('u.id')->orWhereNull('e.id')
            ->orWhereNull('issuer.id')->orWhereColumn('u.employee_id', '!=', 'm.employee_id')->orWhereNull('u.employee_id')
            ->orWhereColumn('m.granted_by', '=', 'm.user_id'))->exists()
            || DB::table('case_memberships')->select('case_file_id', 'user_id')->groupBy('case_file_id', 'user_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new LogicException('Orphan, duplicate or mismatched membership identity.');
        }
        foreach (DB::table('case_memberships')->select(['can_read', 'can_write', 'can_read_confidential', 'revision', 'evidence_ref'])->cursor() as $row) {
            if (! in_array($row->can_read, [0, 1, '0', '1'], true) || ! in_array($row->can_write, [0, 1, '0', '1'], true)
                || ! in_array($row->can_read_confidential, [0, 1, '0', '1'], true) || $row->revision < 1
                || (($row->can_write || $row->can_read_confidential) && ! $row->can_read)
                || preg_match('/^[A-Za-z0-9._:-]{1,80}$/D', $row->evidence_ref) !== 1) {
                throw new LogicException('Invalid membership flags, revision or evidence.');
            }
        }
    }

    public static function create(array $expected): void
    {
        self::assertTarget($expected);
        self::validate(); // Reject a malformed existing shape before changing any other table.
        if (! Schema::hasColumn('case_files', 'is_confidential')) {
            Schema::table('case_files', fn (Blueprint $table) => $table->boolean('is_confidential')->nullable());
        }
        if (! Schema::hasTable('case_memberships')) {
            Schema::create('case_memberships', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('case_file_id')->constrained()->restrictOnDelete();
                $table->foreignId('user_id')->constrained()->restrictOnDelete();
                $table->foreignId('employee_id')->constrained()->restrictOnDelete();
                $table->boolean('can_read')->default(false);
                $table->boolean('can_write')->default(false);
                $table->boolean('can_read_confidential')->default(false);
                $table->foreignId('granted_by')->nullable()->constrained('users')->restrictOnDelete();
                $table->string('evidence_ref', 80);
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->unsignedInteger('revision')->default(1);
                $table->timestamps();
                $table->unique(['case_file_id', 'user_id']);
                $table->index(['user_id', 'revoked_at', 'expires_at']);
            });
        }
        self::validate();
    }

    private static function column(string $table, string $name, array $types, bool $nullable, bool $nullDefault = false): void
    {
        $column = collect(Schema::getColumns($table))->firstWhere('name', $name);
        if (! $column || ! in_array(strtolower($column['type_name']), $types, true)
            || $column['nullable'] !== $nullable || ($nullDefault && self::defaultValue($column['default']) !== null)
            || $column['generation'] !== null) {
            throw new LogicException('Unexpected column shape: '.$table.'.'.$name);
        }
    }

    private static function defaultValue(mixed $value): ?string
    {
        // MariaDB information_schema may return the SQL NULL literal as text.
        return $value === null || strtoupper((string) $value) === 'NULL' ? null : trim((string) $value, "'\"()");
    }
}
