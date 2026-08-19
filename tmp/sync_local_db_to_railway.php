<?php

declare(strict_types=1);

$local = new PDO(
    'mysql:host=127.0.0.1;port=3306;dbname=employee_management;charset=utf8mb4',
    'root',
    '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false],
);

$remote = new PDO(
    sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        getenv('REMOTE_DB_HOST') ?: '127.0.0.1',
        getenv('REMOTE_DB_PORT') ?: '13306',
        getenv('REMOTE_DB_DATABASE') ?: 'railway',
    ),
    getenv('REMOTE_DB_USERNAME') ?: 'root',
    getenv('REMOTE_DB_PASSWORD') ?: '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false],
);

$excluded = [
    'cache', 'cache_locks', 'failed_jobs', 'job_batches', 'jobs', 'migrations',
    'password_reset_tokens', 'personal_access_tokens', 'sessions',
];

$identifier = static fn (string $value): string => '`'.str_replace('`', '``', $value).'`';
$tableRows = static function (PDO $connection): array {
    return array_map(static fn (array $row): string => (string) array_values($row)[0], $connection->query('SHOW TABLES')->fetchAll(PDO::FETCH_ASSOC));
};

$localTables = $tableRows($local);
$remoteTables = array_fill_keys($tableRows($remote), true);

$remote->exec('SET FOREIGN_KEY_CHECKS=0');

foreach ($localTables as $table) {
    if (in_array($table, $excluded, true) || ! isset($remoteTables[$table])) {
        continue;
    }

    $localColumns = $local->query('SHOW COLUMNS FROM '.$identifier($table))->fetchAll(PDO::FETCH_ASSOC);
    $remoteColumns = $remote->query('SHOW COLUMNS FROM '.$identifier($table))->fetchAll(PDO::FETCH_ASSOC);
    $remoteColumnNames = array_fill_keys(array_column($remoteColumns, 'Field'), true);
    $columns = [];

    foreach ($localColumns as $column) {
        if (isset($remoteColumnNames[$column['Field']]) && ! str_contains((string) $column['Extra'], 'GENERATED')) {
            $columns[] = $column['Field'];
        }
    }

    if ($columns === []) {
        continue;
    }

    $select = $local->query('SELECT '.implode(', ', array_map($identifier, $columns)).' FROM '.$identifier($table));

    $rows = $select->fetchAll(PDO::FETCH_ASSOC);
    if ($rows === []) {
        echo $table.": 0\n";
        continue;
    }

    $columnSql = implode(', ', array_map($identifier, $columns));
    $rowPlaceholders = '('.implode(', ', array_fill(0, count($columns), '?')).')';
    $primaryRows = $local->query('SHOW KEYS FROM '.$identifier($table)." WHERE Key_name = 'PRIMARY'")->fetchAll(PDO::FETCH_ASSOC);
    $primaryColumns = array_values(array_unique(array_column($primaryRows, 'Column_name')));
    $updateColumns = array_values(array_diff($columns, $primaryColumns));
    $insertSql = 'INSERT INTO '.$identifier($table).' ('.$columnSql.') VALUES ';
    if ($updateColumns !== []) {
        $insertSql .= ' ON DUPLICATE KEY UPDATE '.implode(', ', array_map(
            static fn (string $column): string => $identifier($column).' = VALUES('.$identifier($column).')',
            $updateColumns,
        ));
    } else {
        $insertSql = 'INSERT IGNORE INTO '.$identifier($table).' ('.$columnSql.') VALUES ';
    }

    foreach (array_chunk($rows, 100) as $chunk) {
        $values = [];
        $bindings = [];
        foreach ($chunk as $row) {
            $values[] = $rowPlaceholders;
            foreach ($columns as $column) {
                $bindings[] = $row[$column];
            }
        }
        $statement = $remote->prepare($insertSql.implode(', ', $values));
        $statement->execute($bindings);
    }

    echo $table.': '.count($rows)."\n";
}

$remote->exec('SET FOREIGN_KEY_CHECKS=1');
echo "DB sync complete\n";
