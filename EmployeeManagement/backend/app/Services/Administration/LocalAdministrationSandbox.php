<?php

namespace App\Services\Administration;

use LogicException;

/** No bootstrap/recovery apply against a real installation is authorized by this local phase. */
final class LocalAdministrationSandbox
{
    public static function requireMemoryDatabase(): void
    {
        if (! app()->environment('testing') || config('database.default') !== 'sqlite'
            || config('database.connections.sqlite.database') !== ':memory:'
            || config('database.connections.sqlite.url') || config('database.connections.sqlite.read')
            || config('database.connections.sqlite.write')) {
            throw new LogicException('Bootstrap/recovery apply is limited to synthetic testing SQLite :memory:.');
        }
    }
}
