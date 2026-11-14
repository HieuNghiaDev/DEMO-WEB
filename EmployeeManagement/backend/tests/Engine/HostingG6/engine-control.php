<?php

require dirname(__DIR__, 3).'/vendor/autoload.php';
foreach (['Target', 'Fixtures', 'Installer'] as $class) require dirname(__DIR__, 3).'/database/staging/'.$class.'.php';

use Themis\Staging\{Installer, Target};
use Illuminate\Support\Facades\DB;

try {
    $root = realpath($argv[2] ?? '');
    $a = json_decode(file_get_contents($root.'/admission.json'), true, flags: JSON_THROW_ON_ERROR);
    $c = json_decode(file_get_contents($root.'/provisioner.json'), true, flags: JSON_THROW_ON_ERROR);
    Target::validate($a, $c);
    $admin = json_decode(file_get_contents($root.'/instance-admin.json'), true, flags: JSON_THROW_ON_ERROR);
    $pdo = new PDO('mysql:host=127.0.0.1;port='.$a['port'].';dbname='.$a['database'].';charset=utf8mb4', 'root', $admin['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    Target::assertServer($pdo, $a, 'root');
    if ($argv[1] === 'shutdown') {
        $pdo->exec('SHUTDOWN'); echo "OWN_DISPOSABLE_SHUTDOWN=PASS\n"; exit;
    }
    if ($argv[1] === 'verify-partial-failure') {
        $events = array_map(fn ($line) => json_decode($line, true, flags: JSON_THROW_ON_ERROR), file($root.'/provisioning.jsonl', FILE_IGNORE_NEW_LINES));
        $complete = count(array_filter($events, fn ($e) => $e['event'] === 'ddl_complete'));
        if ($complete < 1 || end($events)['event'] !== 'failed_target_retained_no_resume'
            || (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 0) throw new LogicException('Partial-DDL evidence missing.');
        try { Target::assertEmpty($pdo); throw new RuntimeException('Nonempty target accepted.'); }
        catch (LogicException) {}
        file_put_contents($root.'/partial-ddl-verification.json', json_encode(['status' => 'PASS', 'completed_steps' => $complete,
            'failure_recorded' => true, 'nonempty_retry_denied' => true, 'fixture_accounts' => 0, 'target_retained' => true], JSON_THROW_ON_ERROR));
        echo "PARTIAL_DDL_FAIL_CLOSED=PASS\n"; exit;
    }
    if ($argv[1] === 'restore-create') {
        $name = 'themis_g6_restore_'.$a['run_id'];
        $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?'); $q->execute([$name]);
        if ($q->fetchColumn()) throw new LogicException('Restore destination already exists; never overwrite.');
        $pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        foreach (['localhost', '127.0.0.1'] as $host) {
            $pdo->exec('GRANT ALL PRIVILEGES ON `'.$name.'`.* TO \''.$a['provisioning_user'].'\'@\''.$host.'\'');
            $pdo->exec('GRANT SELECT,INSERT,UPDATE,DELETE ON `'.$name.'`.* TO \''.$a['runtime_user'].'\'@\''.$host.'\'');
        }
        echo "FRESH_SYNTHETIC_RESTORE_CREATED\n"; exit;
    }
    if ($argv[1] === 'before-backup') {
        Installer::application($a, $c, $root);
        file_put_contents($root.'/backup-snapshot.json', json_encode(snapshot(), JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
        echo "SYNTHETIC_SNAPSHOT=PASS\n"; exit;
    }
    if ($argv[1] === 'verify-restore') {
        // Root is confined to this independently initialized instance; restore name is constructed, not caller SQL.
        $restore = $a; $restore['database'] = 'themis_g6_restore_'.$a['run_id'];
        $rootCredentials = ['username' => 'root', 'password' => $admin['password'], 'app_key' => $c['app_key']];
        Installer::application($restore, $rootCredentials, $root);
        Installer::verifyStructure();
        $expected = json_decode(file_get_contents($root.'/backup-snapshot.json'), true, flags: JSON_THROW_ON_ERROR);
        $actual = snapshot();
        if ($expected !== $actual) throw new LogicException('Restored schema/count/content digest mismatch.');
        $runtime = json_decode(file_get_contents($root.'/runtime.json'), true, flags: JSON_THROW_ON_ERROR);
        Installer::application($restore, $runtime, $root);
        DB::beginTransaction();
        try {
            if (DB::table('case_task_submissions')->where('version', 1)->update(['review_note' => 'SYNTHETIC RESTORE WRITE CHECK']) !== 1) {
                throw new LogicException('Restored application write failed.');
            }
        } finally { DB::rollBack(); }
        $fkRejected = false;
        DB::beginTransaction();
        try { DB::table('case_tasks')->where('id', 1)->update(['case_file_id' => 99999999]); }
        catch (\Illuminate\Database\QueryException $e) { $fkRejected = ($e->errorInfo[0] ?? null) === '23000'; }
        finally { DB::rollBack(); }
        if (! $fkRejected) throw new LogicException('Restored FK enforcement failed.');
        file_put_contents($root.'/restore-verification.json', json_encode(['status' => 'PASS',
            'tables' => count($actual['tables']), 'triggers' => count($actual['triggers']),
            'all_schema_counts_content_digests_match' => true, 'orphans' => 0,
            'restored_runtime_dml_with_triggers' => true, 'restored_fk_rejects_orphan' => true], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
        echo "SYNTHETIC_RESTORE=PASS\n"; exit;
    }
    throw new LogicException('Unknown control action.');
} catch (Throwable $e) {
    fwrite(STDERR, json_encode(['status' => 'BLOCKED', 'category' => get_class($e),
        'driver_code' => $e instanceof PDOException ? ($e->errorInfo[1] ?? null) : null,
        'reason' => $e instanceof LogicException ? $e->getMessage() : 'Private synthetic diagnostics required.']).PHP_EOL);
    exit(1);
}

function snapshot(): array
{
    $tables = Installer::snapshot();
    foreach ($tables as $name => &$meta) {
        foreach ($meta['foreign_keys'] as &$fk) {
            if (($fk['foreign_schema'] ?? null) === \Illuminate\Support\Facades\DB::connection()->getDatabaseName()) $fk['foreign_schema'] = '@SELF';
            $foreign = $fk['foreign_table'];
            $join = []; $nonnull = [];
            foreach ($fk['columns'] as $i => $column) {
                $join[] = "c.`{$column}` = p.`{$fk['foreign_columns'][$i]}`";
                $nonnull[] = "c.`{$column}` IS NOT NULL";
            }
            $sql = "SELECT COUNT(*) n FROM `{$name}` c LEFT JOIN `{$foreign}` p ON ".implode(' AND ', $join)
                .' WHERE '.implode(' AND ', $nonnull)." AND p.`{$fk['foreign_columns'][0]}` IS NULL";
            if ((int) \Illuminate\Support\Facades\DB::selectOne($sql)->n !== 0) throw new LogicException('Synthetic FK orphan found.');
        }
        unset($fk);
        $rows = \Illuminate\Support\Facades\DB::table($name)->get()->map(fn ($r) => json_encode((array) $r, JSON_THROW_ON_ERROR))->all();
        sort($rows, SORT_STRING); $meta['content_digest'] = hash('sha256', implode("\n", $rows));
    }
    unset($meta);
    $triggers = \Illuminate\Support\Facades\DB::select('SELECT TRIGGER_NAME,EVENT_MANIPULATION,ACTION_TIMING,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME');
    return json_decode(json_encode(['tables' => $tables, 'triggers' => $triggers], JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
}
