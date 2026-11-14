<?php

namespace Themis\Staging\G7;

use LogicException;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/** Local reviewed-candidate builder only. No DB, provider, deployment or application bootstrap. */
final class Artifact
{
    public static function allowed(string $path): bool
    {
        if (str_contains($path, '\\') || str_contains($path, '..') || str_starts_with($path, '/')
            || preg_match('~(?:^|/)(?:\.env(?:\.|$)|\.git|\.codex-deploy|storage|vendor|node_modules|backups?|evidence|uploads?)(?:/|$)|\.(?:sql|enc|pem|key|log|map)$~i', $path)) return false;
        if ($path === 'railway.json') return true;
        $prefix = 'EmployeeManagement/backend/';
        if (! str_starts_with($path, $prefix)) return false;
        $p = substr($path, strlen($prefix));
        return in_array($p, ['artisan', 'composer.json', 'composer.lock', 'bootstrap/app.php', 'bootstrap/providers.php',
            'public/index.php', 'public/.htaccess', 'public/robots.txt', 'public/favicon.ico'], true)
            || preg_match('~^(?:app|config|routes)/[A-Za-z0-9_/-]+\.php$~D', $p) === 1
            || preg_match('~^resources/views/[A-Za-z0-9_/-]+\.blade\.php$~D', $p) === 1;
    }

    public static function composer(string $json): string
    {
        $c = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        $approved = ['Illuminate\\Foundation\\ComposerScripts::postAutoloadDump', '@php artisan package:discover --ansi'];
        if (($c['scripts']['post-autoload-dump'] ?? null) !== $approved) throw new LogicException('Composer install hook requires review.');
        $known = ['setup', 'dev', 'test', 'post-autoload-dump', 'post-update-cmd', 'post-root-package-install',
            'post-create-project-cmd', 'pre-package-uninstall'];
        if (array_diff(array_keys($c['scripts']), $known)) throw new LogicException('Unknown Composer lifecycle hook.');
        // Candidate only: source composer.json/lock remain unchanged. Scripts are outside lock content-hash fields.
        $c['scripts'] = ['post-autoload-dump' => $approved];
        return json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).PHP_EOL;
    }

    public static function inspectBytes(string $bytes): void
    {
        $match = preg_match('~-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
            .'|\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})'
            .'|https?://[^\s/@:]+:[^\s/@]+@~', $bytes);
        if ($match !== 0) throw new LogicException('Secret-like payload or failed scan requires private review; no value printed.');
    }

    public static function prepare(string $repo, string $destination): array
    {
        $repo = realpath($repo);
        if (! $repo || file_exists($destination) || ! is_dir(dirname($destination))) throw new LogicException('New candidate directory required.');
        $normalized = str_replace('\\', '/', $repo);
        $parent = str_replace('\\', '/', realpath(dirname($destination)));
        if ($parent === $normalized || str_starts_with($parent, $normalized.'/EmployeeManagement')) {
            throw new LogicException('Candidate must not overwrite or sit inside application source.');
        }
        $config = json_decode(file_get_contents($repo.'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        if (($config['deploy']['preDeployCommand'] ?? null) !== 'php -r "exit(0);"' || isset($config['environments'])) {
            throw new LogicException('Unexpected deployment config.');
        }
        $paths = ['railway.json', 'EmployeeManagement/backend/artisan', 'EmployeeManagement/backend/composer.json',
            'EmployeeManagement/backend/composer.lock', 'EmployeeManagement/backend/bootstrap/app.php',
            'EmployeeManagement/backend/bootstrap/providers.php', 'EmployeeManagement/backend/public/index.php',
            'EmployeeManagement/backend/public/.htaccess', 'EmployeeManagement/backend/public/robots.txt',
            'EmployeeManagement/backend/public/favicon.ico'];
        foreach (['app', 'config', 'routes', 'resources/views'] as $folder) {
            $root = $repo.'/EmployeeManagement/backend/'.$folder;
            if (! is_dir($root)) throw new LogicException('Required source directory missing.');
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)) as $f) {
                if ($f->isLink()) throw new LogicException('Linked payload denied.');
                if ($f->isFile()) $paths[] = str_replace('\\', '/', substr($f->getPathname(), strlen($repo) + 1));
            }
        }
        $paths = array_values(array_unique($paths)); sort($paths);
        $entries = [];
        foreach ($paths as $path) {
            if (! self::allowed($path)) throw new LogicException('Unclassified file in allowed runtime source tree.');
            $file = $repo.'/'.$path;
            if (! is_file($file) || is_link($file)
                || strtolower(str_replace('\\', '/', realpath($file))) !== strtolower($normalized.'/'.$path)) {
                throw new LogicException('Missing or redirected source file.');
            }
            $bytes = file_get_contents($file); self::inspectBytes($bytes);
            $candidate = str_ends_with($path, '/composer.json') ? self::composer($bytes) : $bytes;
            $entries[] = ['path' => $path, 'source_sha256' => hash('sha256', $bytes),
                'artifact_sha256' => hash('sha256', $candidate), 'bytes' => strlen($candidate),
                'derivation' => $candidate === $bytes ? 'unchanged' : 'reviewed_runtime_composer_scripts_only'];
        }
        // Source content has passed policy before creating the new output directory.
        mkdir($destination, 0700);
        foreach ($entries as $e) {
            $bytes = file_get_contents($repo.'/'.$e['path']);
            if (hash('sha256', $bytes) !== $e['source_sha256']) throw new LogicException('Source changed during candidate assembly.');
            if ($e['derivation'] !== 'unchanged') $bytes = self::composer($bytes);
            $target = $destination.'/'.$e['path'];
            if (! is_dir(dirname($target))) mkdir(dirname($target), 0700, true);
            if (file_put_contents($target, $bytes, LOCK_EX) !== strlen($bytes)) throw new LogicException('Candidate write failed.');
        }
        $emptyDirectories = ['bootstrap/cache', 'storage/app/private', 'storage/app/public', 'storage/framework/cache/data',
            'storage/framework/views', 'storage/framework/sessions', 'storage/logs'];
        foreach ($emptyDirectories as $folder) mkdir($destination.'/EmployeeManagement/backend/'.$folder, 0700, true);
        $manifest = ['purpose' => 'G7_LOCAL_REVIEW_CANDIDATE_NOT_DEPLOYED', 'source' => 'CURRENT_DIRTY_WORKTREE_NOT_A_RELEASE_COMMIT',
            'profile' => 'API-only; no backend Node pipeline; no database installers/migrations/seeders in runtime',
            'files' => $entries, 'created_empty_directories' => $emptyDirectories, 'excluded' => ['.env*', '.git', '.codex-deploy', 'all source storage/cache',
                'database', 'tests', 'vendor', 'node_modules', 'backend package.json/Vite assets', 'OAuth/backup/evidence/client uploads'],
            'remote_effective_config' => 'NOT_ATTESTED'];
        self::verify($destination, $manifest);
        file_put_contents($destination.'/artifact-manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        return $manifest;
    }

    public static function verify(string $directory, array $manifest): void
    {
        $expected = [];
        foreach ($manifest['files'] as $e) {
            if (! self::allowed($e['path']) || hash_file('sha256', $directory.'/'.$e['path']) !== $e['artifact_sha256']) {
                throw new LogicException('Candidate content/policy mismatch.');
            }
            $expected[$e['path']] = true;
        }
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS)) as $f) {
            $relative = str_replace('\\', '/', substr($f->getPathname(), strlen($directory) + 1));
            if ($f->isLink() || ($f->isFile() && $relative !== 'artifact-manifest.json' && ! isset($expected[$relative]))) {
                throw new LogicException('Unmanifested payload denied.');
            }
        }
    }
}
