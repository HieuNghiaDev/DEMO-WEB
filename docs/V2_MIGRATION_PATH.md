# V2 cleanup outside the deployment migration chain

## Current architecture

`database/migrations/2026_08_31_120000_remove_legacy_matter_tasks.php` has been
removed from migration discovery. It is not replaced by a remote-capable
destructive migration. The original migrations that create `matters` and
`tasks` remain; no squashing/baselining was performed.

The explicit replacement is:

```text
php artisan themis:v2-cleanup-legacy --confirm-local
```

Implementation: `EmployeeManagement/backend/app/Console/Commands/CleanupLocalV2LegacyTables.php`.
Laravel discovers the Artisan command normally; neither migration files,
`DatabaseSeeder`, startup nor deployment invokes it.

The command is intentionally **empty-table-only**, not a reusable B2 data
reset. It inspects both legacy tables before dropping anything and refuses
if either contains any row. It never deletes clients, cases, employee data,
approval/log records, user credentials or migration metadata. Drop order is
`tasks` then `matters`; already-absent tables are a successful no-op.

Safety checks precede schema queries:

- Actual connection driver must be MySQL, host exactly `127.0.0.1`, environment
  `local`, database exactly `employee_management`. Split read/write connection
  configurations are rejected.
- Testing exceptions are restricted to SQLite `:memory:` or loopback MySQL
  with exactly `employee_management_v2_test_20260831` /
  `employee_management_v2_test_migration_chain` in `testing` environment.
- Production, staging, remote hosts and unapproved database names are refused.
- Explicit `--confirm-local` is required. There is no force/data-deletion flag.
- `THEMIS_V2_CLEANUP_APPROVED` is no longer used; the obsolete setting was
  removed from `.env.example`. No environment flag permits remote execution.

## Existing local B2 database: leave it alone

The working database `127.0.0.1 / employee_management` already completed B2.
**Do not run the command or B2 again for this database.**

It remains at **48 tables / 54 migration rows**. Keep the historical
`2026_08_31_120000_remove_legacy_matter_tasks` row. No manual ledger adjustment
is necessary or performed.

Laravel's installed `Migrator::getMigrationFiles()` discovers on-disk files;
`pendingMigrations()` subtracts previously recorded names from that file list.
An extra recorded name without a file therefore neither executes nor breaks
forward `migrate`. Read-only inspection found **53 files, 54 history rows,
zero pending files**, and the retired row intact.

This is safe for continued **forward migration**, not a promise of reversible
history. Laravel rollback reports `Migration not found` and skips a missing
file; it cannot undo B2. Do not use rollback/reset/refresh to repair this row.
Recovery of deleted data requires a separately authorized backup restore.
Migration squashing/baselining remains a later task.

## New clean LOCAL development database

Only for a new approved local database, with the correct environment configured
**before booting Artisan**, and no operational data in legacy tables:

```powershell
php artisan migrate --force
php artisan db:seed --class=CleanV2MasterSeeder --force
php artisan themis:v2-cleanup-legacy --confirm-local
```

1. Historical migrations create empty legacy tables alongside the V2 schema.
2. Approved master seeding creates 78 document types and 11 purposes, with no
   demo customers/cases/users/employees.
3. The explicit local command removes only the two empty legacy tables.

The resulting fresh V2 database has **48 tables / 53 migration rows**. The
command creates no migration row, so the one-row difference from the already
cleaned working database is expected. Verify `matters/tasks` absent,
`case_tasks/employee_tasks` present and operational client/case counts zero.

On remote installations, normal migrations may still leave the historical
legacy tables present; runtime code does not depend on them. This task does
not authorize remote legacy cleanup. Do not add the local command to a deploy
script, Railway configuration, seeder or scheduler.

## Railway/deployment-path verification

- No cleanup file remains under `database/migrations` for Laravel to invoke.
- Local SQLite tests simulate `APP_ENV=production` with normal
  `php artisan migrate --force`: all migrations succeed and legacy tables
  remain, proving the local cleanup is not automatically called.
- Explicit cleanup is still refused under production/staging and remote
  connection configurations; no remote connection is made by these tests.
- A separate SQLite fixture models the already-recorded retired migration;
  normal forward migration succeeds without modifying its ledger row.
- This removes the specific local-only guard failure from the deploy path.
  It does not certify every unrelated Railway configuration or migration.
  No Railway connection, CLI, deployment or config edit occurred.

## Verification results

- Full backend suite: **PASS — 172 tests / 1,109 assertions** (baseline was
  168 / 1,069; new migration-path/guard regressions account for the increase).
- Frontend production build: **PASS**. Existing ~658 kB JavaScript chunk-size
  advisory remains.
- Targeted command, V2 and approval tests: **19 tests / 123 assertions PASS**.
- New isolated MySQL DB `employee_management_v2_test_migration_chain` ran all
  53 historical/additive migrations, master seed, then explicit command:
  **PASS**, 78 document types, 11 purposes, zero clients/cases/documents,
  `matters/tasks` absent, migration ledger unchanged by command.
- Working local DB checked read-only after verification: **48 tables / 54
  migrations**, 78/11 masters, clients/case_files/case_documents all zero,
  legacy tables absent. Full-row hashes match the B2 result for every table
  except ongoing cache/token-use metadata already documented in the B2 report.
  No cleanup/reset was run on the working DB.

Verification note: an initial in-process attempt switched default connection
after Laravel had booted; an existing migrator binding attempted `CREATE users`
on the working DB and was rejected because the table already existed. No table
or ledger change resulted. Verification was rerun with isolated DB environment
set before process bootstrap and completed successfully. The working DB's
schema counts, ledger and row hashes were explicitly rechecked afterward.

Changed code: removed cleanup migration; added command; updated `CleanV2Test`
and the approval test to invoke cleanup explicitly where absent legacy tables
are part of the fixture; added `LocalV2MigrationPathTest`; updated `.env.example`.
No authorization, frontend runtime or Railway deployment config changes.

**STOP: no B2 rerun, no deployment/push, no Phase 1C.**
