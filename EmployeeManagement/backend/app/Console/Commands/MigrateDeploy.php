<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class MigrateDeploy extends Command
{
    /**
     * Sandbox-only rehearsal migrations that intentionally reject non-memory databases.
     *
     * @var list<string>
     */
    public const REHEARSAL_ONLY_MIGRATIONS = [
        '2026_10_22_000000_create_rehearsal_case_access.php',
        '2026_10_23_000000_create_rehearsal_review_authorities.php',
    ];

    protected $signature = 'themis:migrate-deploy';

    protected $description = 'Run pending production migrations while skipping sandbox-only rehearsal migrations';

    public function handle(): int
    {
        $paths = self::deployableMigrationPaths(database_path('migrations'));
        if ($paths === []) {
            $this->info('No deployable migrations found.');

            return self::SUCCESS;
        }

        return $this->call('migrate', [
            '--force' => true,
            '--path' => $paths,
        ]);
    }

    /**
     * @return list<string>
     */
    public static function deployableMigrationPaths(string $migrationsDirectory): array
    {
        $files = glob($migrationsDirectory.DIRECTORY_SEPARATOR.'*.php') ?: [];
        sort($files, SORT_STRING);

        $paths = [];
        foreach ($files as $file) {
            $basename = basename($file);
            if (in_array($basename, self::REHEARSAL_ONLY_MIGRATIONS, true)) {
                continue;
            }
            $paths[] = 'database/migrations/'.$basename;
        }

        return $paths;
    }
}
