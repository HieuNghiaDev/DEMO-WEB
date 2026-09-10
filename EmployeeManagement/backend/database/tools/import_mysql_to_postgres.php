<?php

declare(strict_types=1);

use Dotenv\Dotenv;

require dirname(__DIR__, 2).'/vendor/autoload.php';

/**
 * One-way LOCAL MySQL -> PostgreSQL copy tool.
 *
 * It never issues DROP, TRUNCATE, DELETE or any write against MySQL. The
 * PostgreSQL target must have been created with the current migrations and
 * contain no business data before --execute is used.
 *
 * PostgreSQL credentials are read by libpq from PGPASSFILE / pgpass.conf;
 * passwords are intentionally neither read from nor written to this script.
 */
Dotenv::createImmutable(dirname(__DIR__, 2))->safeLoad();

$execute = in_array('--execute', $argv, true);
$verify = in_array('--verify', $argv, true);
$source = connectMysql();
$target = connectPostgres();
$sourceTables = tables($source, 'mysql');
$targetTables = tables($target, 'pgsql');
sort($sourceTables, SORT_STRING);
sort($targetTables, SORT_STRING);

if ($sourceTables !== $targetTables) {
    throw new RuntimeException('Source and target table lists differ. Refusing to import.');
}

foreach ($sourceTables as $table) {
    $sourceColumns = columns($source, 'mysql', $table);
    $targetColumns = columns($target, 'pgsql', $table);
    sort($sourceColumns, SORT_STRING);
    sort($targetColumns, SORT_STRING);
    if ($sourceColumns !== $targetColumns) {
        throw new RuntimeException("Column set differs for {$table}. Refusing to import.");
    }
}

$sourceCounts = counts($source, $sourceTables, 'mysql');
$targetCounts = counts($target, $targetTables, 'pgsql');
if ($verify) {
    printReport('VERIFY', $sourceCounts, $targetCounts);
    foreach ($sourceCounts as $table => $count) {
        if ($targetCounts[$table] !== $count) {
            throw new RuntimeException("Count mismatch for {$table}.");
        }
    }
    verifySequences($target);
    echo "Verification passed. All table counts and PostgreSQL sequences match.\n";
    exit(0);
}
$prepopulatedByMigration = ['document_name_catalog', 'migrations'];
foreach ($targetCounts as $table => $count) {
    if (! in_array($table, $prepopulatedByMigration, true) && $count !== 0) {
        throw new RuntimeException("PostgreSQL table {$table} is not empty. Refusing to import.");
    }
    if (in_array($table, $prepopulatedByMigration, true) && $count !== $sourceCounts[$table]) {
        throw new RuntimeException("Prepopulated PostgreSQL table {$table} does not match the source count. Refusing to import.");
    }
}

printReport('PRE-IMPORT', $sourceCounts, $targetCounts);
if (! $execute) {
    echo "Dry run passed. Re-run with --execute to copy data.\n";
    exit(0);
}

$source->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
$source->beginTransaction();
$target->beginTransaction();
try {
    foreach (topologicalOrder($source, $sourceTables) as $table) {
        copyTable($source, $target, $table, in_array($table, $prepopulatedByMigration, true));
    }
    resetSequences($target);
    $target->commit();
    $source->commit();
} catch (Throwable $exception) {
    if ($target->inTransaction()) {
        $target->rollBack();
    }
    if ($source->inTransaction()) {
        $source->rollBack();
    }
    throw $exception;
}

$targetCounts = counts($target, $targetTables, 'pgsql');
printReport('POST-IMPORT', $sourceCounts, $targetCounts);
foreach ($sourceCounts as $table => $count) {
    if ($targetCounts[$table] !== $count) {
        throw new RuntimeException("Count mismatch remains for {$table}.");
    }
}
echo "Import completed. All table counts match.\n";

function connectMysql(): PDO
{
    if (envValue('DB_CONNECTION') !== 'mysql') {
        throw new RuntimeException('The current .env must remain pointed at the MySQL source while importing.');
    }
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', envValue('DB_HOST'), envValue('DB_PORT'), envValue('DB_DATABASE'));

    return new PDO($dsn, envValue('DB_USERNAME'), envValue('DB_PASSWORD', '', true), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false,
    ]);
}

function connectPostgres(): PDO
{
    $dsn = 'pgsql:host=127.0.0.1;port=5432;dbname=Themis';

    return new PDO($dsn, 'postgres', null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function envValue(string $name, ?string $default = null, bool $allowEmpty = false): string
{
    $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name) ?: $default;
    if ($value === null || (! $allowEmpty && $value === '')) {
        throw new RuntimeException("Missing required source environment value: {$name}");
    }

    return (string) $value;
}

/** @return list<string> */
function tables(PDO $connection, string $driver): array
{
    $sql = $driver === 'mysql'
        ? "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
        : "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name";

    return $connection->query($sql)->fetchAll(PDO::FETCH_COLUMN);
}

/** @return list<string> */
function columns(PDO $connection, string $driver, string $table): array
{
    validateIdentifier($table);
    $sql = $driver === 'mysql'
        ? "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position"
        : "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position";
    $statement = $connection->prepare($sql);
    $statement->execute([$table]);

    return $statement->fetchAll(PDO::FETCH_COLUMN);
}

/** @param list<string> $tableNames @return array<string, int> */
function counts(PDO $connection, array $tableNames, string $driver): array
{
    $counts = [];
    foreach ($tableNames as $table) {
        $identifier = $driver === 'mysql' ? quoteIdentifierMysql($table) : quoteIdentifier($table);
        $counts[$table] = (int) $connection->query('SELECT COUNT(*) FROM '.$identifier)->fetchColumn();
    }

    return $counts;
}

/** @param list<string> $tableNames @return list<string> */
function topologicalOrder(PDO $source, array $tableNames): array
{
    $statement = $source->query("SELECT table_name, referenced_table_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL");
    $dependencies = array_fill_keys($tableNames, []);
    foreach ($statement as $foreignKey) {
        $table = $foreignKey['table_name'];
        $parent = $foreignKey['referenced_table_name'];
        if ($table !== $parent && isset($dependencies[$table], $dependencies[$parent])) {
            $dependencies[$table][$parent] = true;
        }
    }
    $ordered = [];
    while (count($ordered) < count($tableNames)) {
        $available = array_keys(array_filter($dependencies, fn (array $parents, string $table) => ! in_array($table, $ordered, true)
            && array_diff_key($parents, array_flip($ordered)) === [], ARRAY_FILTER_USE_BOTH));
        if ($available === []) {
            throw new RuntimeException('A cross-table foreign-key cycle was found. Refusing to import without an explicit plan.');
        }
        sort($available, SORT_STRING);
        $ordered = [...$ordered, ...$available];
    }

    return $ordered;
}

function copyTable(PDO $source, PDO $target, string $table, bool $upsert): void
{
    $columns = columns($source, 'mysql', $table);
    $primary = primaryKeyColumns($source, $table);
    $quotedColumns = array_map('quoteIdentifier', $columns);
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $suffix = '';
    if ($upsert) {
        if ($primary === []) {
            throw new RuntimeException("Cannot synchronize prepopulated table {$table} without a primary key.");
        }
        $updates = array_values(array_diff($columns, $primary));
        $suffix = ' ON CONFLICT ('.implode(', ', array_map('quoteIdentifier', $primary)).') DO '.($updates === []
            ? 'NOTHING'
            : 'UPDATE SET '.implode(', ', array_map(fn (string $column) => quoteIdentifier($column).' = EXCLUDED.'.quoteIdentifier($column), $updates)));
    }
    $insert = $target->prepare('INSERT INTO '.quoteIdentifier($table).' ('.implode(', ', $quotedColumns).') VALUES ('.$placeholders.')'.$suffix);
    $order = $primary === [] ? '' : ' ORDER BY '.implode(', ', array_map('quoteIdentifierMysql', $primary));
    $rows = $source->query('SELECT * FROM '.quoteIdentifierMysql($table).$order)->fetchAll();
    $rows = selfReferenceOrder($source, $table, $rows);
    foreach ($rows as $row) {
        $insert->execute(array_map(fn (string $column) => $row[$column], $columns));
    }
}

/**
 * MySQL currently stores some child case types with a lower ID than their
 * parent. PostgreSQL enforces that self-FK immediately, so reorder those rows
 * before insert rather than disabling constraints.
 *
 * @param list<array<string, mixed>> $rows
 * @return list<array<string, mixed>>
 */
function selfReferenceOrder(PDO $connection, string $table, array $rows): array
{
    $statement = $connection->prepare("SELECT column_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name = ?");
    $statement->execute([$table, $table]);
    $foreignKeys = $statement->fetchAll();
    if ($foreignKeys === [] || $rows === []) {
        return $rows;
    }
    $remaining = $rows;
    $insertedReferences = [];
    $ordered = [];
    while ($remaining !== []) {
        $available = [];
        foreach ($remaining as $index => $row) {
            $ready = true;
            foreach ($foreignKeys as $foreignKey) {
                $reference = $row[$foreignKey['column_name']];
                if ($reference !== null && ! isset($insertedReferences[(string) $reference])) {
                    $ready = false;
                    break;
                }
            }
            if ($ready) {
                $available[$index] = $row;
            }
        }
        if ($available === []) {
            throw new RuntimeException("A self-referencing data cycle was found in {$table}. Refusing to import.");
        }
        foreach ($available as $index => $row) {
            unset($remaining[$index]);
            foreach ($foreignKeys as $foreignKey) {
                $insertedReferences[(string) $row[$foreignKey['referenced_column_name']]] = true;
            }
            $ordered[] = $row;
        }
    }

    return $ordered;
}

/** @return list<string> */
function primaryKeyColumns(PDO $connection, string $table): array
{
    validateIdentifier($table);
    $statement = $connection->prepare("SELECT column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = 'PRIMARY' ORDER BY ordinal_position");
    $statement->execute([$table]);

    return $statement->fetchAll(PDO::FETCH_COLUMN);
}

function resetSequences(PDO $target): void
{
    $sequences = $target->query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval(%' ORDER BY table_name, ordinal_position")->fetchAll();
    foreach ($sequences as $sequence) {
        $table = $sequence['table_name'];
        $column = $sequence['column_name'];
        $maximum = $target->query('SELECT MAX('.quoteIdentifier($column).') FROM '.quoteIdentifier($table))->fetchColumn();
        $set = $target->prepare('SELECT setval(pg_get_serial_sequence(?, ?), ?, ?)');
        $set->bindValue(1, $table);
        $set->bindValue(2, $column);
        $set->bindValue(3, $maximum === null ? 1 : (int) $maximum, PDO::PARAM_INT);
        $set->bindValue(4, $maximum !== null, PDO::PARAM_BOOL);
        $set->execute();
    }
}

function verifySequences(PDO $target): void
{
    $sequences = $target->query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval(%' ORDER BY table_name, ordinal_position")->fetchAll();
    foreach ($sequences as $sequence) {
        $table = $sequence['table_name'];
        $column = $sequence['column_name'];
        $name = $target->prepare('SELECT pg_get_serial_sequence(?, ?)');
        $name->execute([$table, $column]);
        $sequenceName = $name->fetchColumn();
        $state = $target->query('SELECT last_value, is_called FROM '.$sequenceName)->fetch();
        $maximum = $target->query('SELECT MAX('.quoteIdentifier($column).') FROM '.quoteIdentifier($table))->fetchColumn();
        $valid = $maximum === null
            ? (int) $state['last_value'] === 1 && ! $state['is_called']
            : (int) $state['last_value'] >= (int) $maximum && (bool) $state['is_called'];
        if (! $valid) {
            throw new RuntimeException("Sequence {$sequenceName} is not safe for {$table}.{$column}.");
        }
        printf("SEQUENCE %-36s %s\n", $sequenceName, 'OK');
    }
}

/** @param array<string, int> $source @param array<string, int> $target */
function printReport(string $heading, array $source, array $target): void
{
    echo "\n{$heading}\n";
    foreach ($source as $table => $count) {
        printf("%-40s %8d %8d %s\n", $table, $count, $target[$table], $count === $target[$table] ? 'OK' : 'PENDING');
    }
}

function quoteIdentifier(string $identifier): string
{
    validateIdentifier($identifier);

    return '"'.$identifier.'"';
}

function quoteIdentifierMysql(string $identifier): string
{
    validateIdentifier($identifier);

    return '`'.$identifier.'`';
}

function validateIdentifier(string $identifier): void
{
    if (preg_match('/\A[a-z][a-z0-9_]*\z/', $identifier) !== 1) {
        throw new RuntimeException("Unexpected database identifier: {$identifier}");
    }
}
