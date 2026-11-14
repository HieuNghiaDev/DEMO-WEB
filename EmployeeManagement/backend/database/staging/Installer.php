<?php

namespace Themis\Staging;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\{DB, Http, Schema};
use LogicException;
use PDO;

final class Installer
{
    // Updated only alongside the reviewed source manifest, never derived from operator input.
    public const SCHEMA_HASH = 'a4758127866767e1d4b87f9333af48ea4772867e351333a3763ea04a1a5b1f12';
    public const FIXTURE_HASH = 'bf3e72ce44b3048c806e22f9b1d28c96babf6043fd4497e92e8e54925f38ebc2';

    public static function manifest(string $file, string $expected, string $base): array
    {
        if (! hash_equals($expected, hash_file('sha256', $file))) throw new LogicException('Unapproved manifest digest.');
        $m = json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
        foreach ($m['steps'] ?? [] as $s) {
            $path = realpath($base.'/'.$s['path']);
            if (! $path || ! str_starts_with(str_replace('\\', '/', $path), str_replace('\\', '/', realpath($base)).'/')
                || ! hash_equals($s['sha256'], hash_file('sha256', $path))) throw new LogicException('Structural source changed.');
            if (isset($s['derived_from']) && ! hash_equals($s['source_sha256'], hash_file('sha256', $base.'/'.$s['derived_from']))) {
                throw new LogicException('Reviewed structural source drift.');
            }
        }
        return $m;
    }

    public static function application(array $a, array $credentials, string $privateRoot): \Illuminate\Foundation\Application
    {
        $base = dirname(__DIR__, 2);
        foreach (['APP_ENV' => 'production', 'APP_DEBUG' => 'false', 'APP_KEY' => $credentials['app_key'],
            'APP_CONFIG_CACHE' => $privateRoot.'/absent-config.php', 'DB_CONNECTION' => 'mysql', 'DB_HOST' => $a['host'],
            'DB_PORT' => (string) $a['port'], 'DB_DATABASE' => $a['database'], 'DB_USERNAME' => $credentials['username'],
            'DB_PASSWORD' => $credentials['password'], 'DB_URL' => '', 'DB_SOCKET' => '', 'CACHE_STORE' => 'array',
            'SESSION_DRIVER' => 'array', 'SESSION_CONNECTION' => 'mysql', 'QUEUE_CONNECTION' => 'sync',
            'MAIL_MAILER' => 'array', 'LOG_CHANNEL' => 'null', 'GOOGLE_DRIVE_ENABLED' => 'false',
            'GOOGLE_DRIVE_WRITE_ENABLED' => 'false', 'GOOGLE_DRIVE_OAUTH_PRODUCTION_ENABLED' => 'false',
            'ANTHROPIC_API_KEY' => '', 'GROQ_API_KEY' => '', 'GEMINI_API_KEY' => '', 'OPENAI_API_KEY' => '',
            'HTTP_PROXY' => 'http://127.0.0.1:9', 'HTTPS_PROXY' => 'http://127.0.0.1:9', 'NO_PROXY' => ''] as $key => $value) {
            putenv($key.'='.$value); $_ENV[$key] = $value; $_SERVER[$key] = $value;
        }
        $app = require $base.'/bootstrap/app.php';
        // Do not read the application's real .env or cached config/receipt/storage.
        $app->loadEnvironmentFrom('absent-g6-environment');
        $app->useStoragePath($privateRoot.'/storage');
        $app->make(Kernel::class)->bootstrap();
        $cfg = config('database.connections.mysql');
        unset($cfg['read'], $cfg['write']);
        $cfg['timezone'] = '+00:00';
        DB::purge(); config(['database.connections' => ['mysql' => $cfg], 'database.default' => 'mysql']);
        // Discard even process-inherited provider configuration; this CLI context has no external credentials.
        config(['services.google_drive' => ['enabled' => false, 'write_enabled' => false,
            'oauth_production_enabled' => false, 'auth_mode' => 'service_account'],
            'ai.provider' => 'claude', 'ai.fallback_provider' => null]);
        Target::assertServer(DB::connection()->getPdo(), $a, $credentials['username']);
        DB::connection()->beforeExecuting(function (string $sql, array $bindings, $connection) use ($a): void {
            if ($connection->getDatabaseName() !== $a['database'] || $connection->getPdo()->query('SELECT DATABASE()')->fetchColumn() !== $a['database']
                || preg_match('/^\s*(?:USE\b|GRANT\b|REVOKE\b|(?:CREATE|ALTER|DROP)\s+(?:DATABASE|USER)\b|SET\s+(?:@@)?GLOBAL\b)/i', $sql)
                || preg_match('/(?:`?employee_management[^`\s.]*`?)\s*\./i', $sql)) {
                throw new LogicException('Forbidden provisioning/application target statement.');
            }
        });
        Http::preventStrayRequests();
        return $app;
    }

    public static function apply(array $a, array $credentials, string $privateRoot): array
    {
        $base = dirname(__DIR__, 2);
        Target::validate($a, $credentials, ['DB_URL' => getenv('DB_URL'), 'DB_SOCKET' => getenv('DB_SOCKET')]);
        if (($a['schema_sha256'] ?? null) !== self::SCHEMA_HASH || ($a['fixture_sha256'] ?? null) !== self::FIXTURE_HASH) {
            throw new LogicException('Admission manifest mismatch.');
        }
        $schema = self::manifest(__DIR__.'/schema.json', self::SCHEMA_HASH, $base);
        $fixtures = self::manifest(__DIR__.'/fixtures.json', self::FIXTURE_HASH, $base);
        if (! hash_equals($fixtures['writer_sha256'], hash_file('sha256', __DIR__.'/Fixtures.php'))) {
            throw new LogicException('Synthetic fixture writer drift.');
        }
        $journal = fopen($privateRoot.'/provisioning.jsonl', 'x');
        if (! $journal) throw new LogicException('Existing/missing journal; no implicit resume.');
        $record = static function (array $row) use ($journal): void {
            if (fwrite($journal, json_encode($row, JSON_THROW_ON_ERROR).PHP_EOL) === false || ! fflush($journal)) {
                throw new LogicException('Durable provisioning journal unavailable.');
            }
        };
        $pdo = null; $locked = false;
        try {
            $pdo = Target::connect($a, $credentials);
            $stmt = $pdo->prepare('SELECT GET_LOCK(?,0)'); $stmt->execute(['g6:'.$a['database']]);
            $locked = (int) $stmt->fetchColumn() === 1;
            if (! $locked) throw new LogicException('Provisioner already active.');
            Target::assertEmpty($pdo);
            self::application($a, $credentials, $privateRoot);
            $record(['event' => 'admitted_empty_target', 'run' => $a['run_id'], 'schema' => self::SCHEMA_HASH]);
            $record(['event' => 'ddl_start', 'path' => '@synthetic_admission_marker']);
            Schema::create('g6_synthetic_admission', function ($t): void {
                $t->unsignedTinyInteger('id')->primary(); $t->string('purpose'); $t->char('identity_hash', 64);
                $t->char('schema_hash', 64); $t->char('fixture_hash', 64);
            });
            DB::table('g6_synthetic_admission')->insert(['id' => 1, 'purpose' => Target::PURPOSE,
                'identity_hash' => hash('sha256', json_encode($a, JSON_THROW_ON_ERROR)),
                'schema_hash' => self::SCHEMA_HASH, 'fixture_hash' => self::FIXTURE_HASH]);
            $record(['event' => 'ddl_complete', 'path' => '@synthetic_admission_marker']);
            foreach ($schema['steps'] as $step) {
                Target::assertServer(DB::connection()->getPdo(), $a, $a['provisioning_user']);
                $record(['event' => 'ddl_start', 'path' => $step['path'], 'sha256' => $step['sha256']]);
                (require $base.'/'.$step['path'])->up();
                $record(['event' => 'ddl_complete', 'path' => $step['path']]);
            }
            self::verifyStructure();
            $handover = Fixtures::apply($fixtures);
            if (file_put_contents($privateRoot.'/synthetic-credential-handover.json', json_encode($handover, JSON_THROW_ON_ERROR), LOCK_EX) === false) {
                throw new LogicException('Private synthetic credential handover failed.');
            }
            $snapshot = self::snapshot();
            file_put_contents($privateRoot.'/schema-and-counts.json', json_encode($snapshot, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            $record(['event' => 'complete', 'tables' => count($snapshot)]);
            return ['status' => 'SYNTHETIC_PROVISIONED', 'tables' => count($snapshot)];
        } catch (\Throwable $e) {
            $record(['event' => 'failed_target_retained_no_resume', 'category' => get_class($e)]);
            throw $e;
        } finally {
            if ($locked) { $pdo->query("SELECT RELEASE_LOCK('g6:".$a['database']."')"); }
            fclose($journal);
        }
    }

    public static function verifyStructure(): void
    {
        \App\Services\RuntimeCaseAccessSchema::validate(); // Read-only shape validation, not its local-only create().
        foreach (['users', 'account_action_tokens', 'account_mfa', 'authentication_challenges', 'mfa_recovery_codes',
            'c001_version_provenance', 'c001_legal_proofs', 'c001_legal_decisions', 'case_task_submissions'] as $table) {
            if (! Schema::hasTable($table)) throw new LogicException('Missing required operational schema.');
        }
        foreach (['lawyer_verifications', 'legal_delegation_issuers', 'legal_delegations', 'rehearsal_lawyer_verifications', 'migrations', 'matters', 'tasks'] as $table) {
            if (Schema::hasTable($table)) throw new LogicException('Unapproved/fictional-history schema.');
        }
        $triggers = DB::select('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
        if (count($triggers) !== 16) throw new LogicException('Immutable C001 trigger inventory mismatch.');
    }

    public static function snapshot(): array
    {
        $out = [];
        foreach (Schema::getTables() as $t) {
            $table = $t['name'];
            $out[$table] = ['columns' => Schema::getColumns($table), 'indexes' => Schema::getIndexes($table),
                'foreign_keys' => Schema::getForeignKeys($table), 'rows' => DB::table($table)->count()];
        }
        ksort($out);
        return $out;
    }
}
