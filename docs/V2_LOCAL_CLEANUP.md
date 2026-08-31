# THEMIS V2 local cleanup — 2026-08-31

> Deployment-path finalization: the local cleanup migration was retired from
> normal migration discovery after B2. Use [V2_MIGRATION_PATH.md](V2_MIGRATION_PATH.md)
> for current new-development-DB instructions. Do not rerun the historical B2
> procedure or environment opt-in below.

> B2 is now completed on the approved local database: 48 tables / 54 migrations,
> zero operational case/client data, 78 document types and 11 purposes. See
> [B2_LOCAL_CLEANUP_REPORT.md](B2_LOCAL_CLEANUP_REPORT.md). Earlier stop-point
> notes below are historical; Phase 1C remains unstarted.

> Update: the B1 403 test-fixture follow-up now passes (168 tests / 1,069
> assertions). B2 is still NOT authorized or executed. See
> [B1_403_VERIFICATION.md](B1_403_VERIFICATION.md). The original stop-point
> inventory and failed-run results below are retained as historical evidence.

## Status: B1 blocked; B2 NOT executed

The working database is still `local`, MySQL `127.0.0.1`, database
`employee_management`. No working database rows or tables were deleted, and its
migration ledger remains at 53 entries. All 50 table counts were rechecked after
verification and match the initial inventory. Do not deploy this preparation:
the cleanup migration intentionally refuses unapproved/remote environments.

The user requires a stop if B1 fails. The complete backend suite has 14 failing
tests, so the working database reset and master reseed have NOT run. There is
no claim that the working database is already clean V2.

## Backup

- Location: `D:/project/procet_web/backups/themis-v2-20260831/employee_management-before-v2.sql`
- Full local dump, 520,581 bytes, 50 CREATE TABLE statements.
- Readable, SQL dump completion marker verified, SHA-256 rechecked unchanged:
  `8edd52fdd2e42d02fe53e7b4d991a5fe4dd438f975e0751a7b8c6660b99291e8`
- Created with transactional snapshot, triggers, routines and events options.
- Kept outside tracked source in ignored `backups/`. Contains sensitive data;
  do not commit or publish. No second dump or automatic restore was performed.

## B1 code preparation

Backend paths below are relative to `EmployeeManagement/backend/`:

- Removed `app/Models/Matter.php`, `app/Models/Task.php` and `Client::matters()`.
- Removed `app/AI/Tools/{ListTasksTool,CreateTaskTool,UpdateTaskTool}.php` and
  their registration in `app/Services/ToolRegistry.php`. `log_action` and
  `request_approval` infrastructure remains.
- `app/Services/SkillLoader.php` refuses `task_management` and
  `morning_briefing`. Their markdown definitions now describe the pause and
  advertise no legacy tools. Persona markdown and `PersonaSeeder.php` have
  no active legacy skills. `PersonaController.php` also filters stale DB skills.
- `AiChatController.php` rejects disabled/unassigned skills with 422 and
  `ai_skill_unavailable`, before calling the AI provider.
- `RequestApprovalTool.php` rejects legacy `delete_task`. The old execute
  endpoint in `ApprovalRequestController.php` returns 410 with
  `legacy_execution_unavailable`, retaining auth/permission middleware.
  List/approve/reject and notification infrastructure remain. No legacy IDs
  are interpreted as case-task or employee-task IDs.
- `app/Models/CaseFile.php` declares the `case_type_id` FK explicitly in
  `caseTypeOption()`.
- `database/seeders/DatabaseSeeder.php` calls only the new
  `CleanV2MasterSeeder.php`. It seeds canonical case types, persona config,
  document-type master and purposes; empty office/RBAC/template catalogs are
  bootstrapped without overwriting populated ones. It does not create
  employees, users, clients, cases, case documents, approvals or AI demo data.
- `CaseTypeSeeder.php` maintains canonical parent/subtype relationships and
  makes `継続技能` inactive. It does not automatically delete existing case types.
- Removed obsolete `AiDemoSeeder.php` and its test, which depended on removed
  models. Other case demo seeders remain explicit utilities, not default seeds.
- Added migration `2026_08_31_120000_remove_legacy_matter_tasks.php`:
  existence checks, drop `tasks` then `matters`. Existing historical migrations
  `2026_08_18_150001_create_matters_table.php` and
  `2026_08_18_150002_create_tasks_table.php` remain untouched.
- Added `.env.example` documentation for `THEMIS_V2_CLEANUP_APPROVED=0`.

Frontend paths are relative to `EmployeeManagement/frontend/src/`:

- `pages/ApprovalRoom.tsx`: removes the obsolete execution button/dialog;
  approve/reject/list remain.
- `features/ai/aiChat.ts`: filters legacy skills, blocks stale submit calls and
  supplies the Japanese paused-state message.
- `pages/AI.tsx`, `components/ai/ThemisAiAssistant.tsx`: retain the page and
  mascot, show paused state and disable submission when no skill is available.

Tests updated: `AiChatApiTest`, `ApprovalManagementApiTest`,
`ApprovalNotificationTest`, `CaseFileApiTest`, `DocumentPurposeTest`,
`DocumentTypeMasterSeederTest`, `PersonaApiTest`, `AIOrchestratorTest`,
`ClaudePreparationTest`, `PersonaLoaderTest`, `SkillLoaderTest`,
`ToolRegistryTest`. Added `CleanV2Test` and `tests/Support/AiTestDefinitions.php`.
AI infrastructure tests use an isolated synthetic tool, not a legacy Task model
or a real provider call. API, architecture and data-model documentation updated.

`case_documents.status/file_url`, templates, template items, document-name
catalog, precedents, meeting logs and custom sections are retained. Provider
integration, secretary log schema and persona schema remain. No Phase 1C rules
or replacement AI case-task features were implemented.

## Isolated database verification

Created a separate local MySQL database:
`employee_management_v2_test_20260831`. It remains available for investigation.
Full additive migration chain and `CleanV2MasterSeeder` succeeded there.
The same tests never reset the working DB; PHPUnit uses SQLite `:memory:`.

| Check | Isolated MySQL result |
| --- | ---: |
| `matters`, `tasks` | absent |
| `case_tasks`, `employee_tasks` | present |
| `document_types` / distinct codes | 78 / 78 |
| `document_purposes` | 11 |
| `case_types` | 28 |
| `case_type_document_rules` | 0 |
| clients, case_files, case_documents, received_documents, case_tasks | 0 each |
| users, employees | 0 each |
| canonical parent rows 労災 / 交通事故 | present |
| obsolete 労災事故 | absent |
| 継続技能 | present, inactive |

Canonical branches are 労災 → 療養（業務災害・通勤災害）, 休業（補償）給付,
障害（補償）給付; and 交通事故 → 傷害事故, 後遺障害, 死亡事故.
The working DB case-type data remains unchanged at this stop point.

## Test gate

- Backend full suite: **165 tests, 925 assertions, 0 errors, 14 failures,
  6 risky tests**. JUnit result is in the ignored backup directory as
  `b1-tests.xml`.
- Failed groups: `AttendanceAuthorizationTest` (3),
  `AttendanceOutsideStatusTest` (4), `EmployeeTaskWorkflowTest` (4),
  `PersonalAttendanceReportTest` (1), `SecurityAuditLogTest` attendance case (1),
  `WorkSessionTest` (1).
- Failures receive permission-middleware 403 instead of reaching the expected
  endpoint/ownership check. Inspected fixtures create users without assigning
  the RBAC roles required by the current middleware. Authentication and
  attendance runtime permissions were not weakened to make these tests pass.
  These failures need separate resolution before B2; do not ignore the gate.
- V2, relation, seeder, AI/approval and case-workspace tests have no failures in
  that suite. New tests cover canonical parent/subtype, repeatable seeding,
  disabled skills without provider calls, stale delete-task approvals,
  migration environment refusal and repeated isolated cleanup.
- Frontend `npm run build`: **passed** (TypeScript + Vite). Existing bundle-size
  warning remains: JavaScript chunk about 658 kB, exceeding 500 kB advisory.
- Browser/UI verification was not performed. No claim of completed live
  end-to-end application verification is made.

## Working database: exact before / after stop

After means after B1 preparation and read-only checks, **not after cleanup**.

| Table | Before | After |
| --- | ---: | ---: |
| approval_requests | 9 | 9 |
| attendances | 46 | 46 |
| attendance_periods | 36 | 36 |
| cache | 20 | 20 |
| cache_locks | 0 | 0 |
| case_activities | 19 | 19 |
| case_custom_sections | 0 | 0 |
| case_deadlines | 2 | 2 |
| case_documents | 22 | 22 |
| case_document_purposes | 0 | 0 |
| case_document_received_documents | 0 | 0 |
| case_files | 10 | 10 |
| case_meeting_logs | 4 | 4 |
| case_parties | 1 | 1 |
| case_precedents | 2 | 2 |
| case_tasks | 2 | 2 |
| case_types | 29 | 29 |
| case_type_document_rules | 0 | 0 |
| case_type_document_rule_purposes | 0 | 0 |
| clients | 12 | 12 |
| departments | 0 | 0 |
| document_name_catalog | 6 | 6 |
| document_purposes | 11 | 11 |
| document_templates | 16 | 16 |
| document_template_items | 83 | 83 |
| document_types | 78 | 78 |
| employees | 7 | 7 |
| employee_notifications | 19 | 19 |
| employee_tasks | 12 | 12 |
| failed_jobs | 0 | 0 |
| jobs | 0 | 0 |
| job_batches | 0 | 0 |
| matters | 4 | 4 |
| migrations | 53 | 53 |
| offices | 2 | 2 |
| password_reset_tokens | 0 | 0 |
| permissions | 30 | 30 |
| personal_access_tokens | 29 | 29 |
| personas | 1 | 1 |
| received_documents | 0 | 0 |
| roles | 5 | 5 |
| role_permissions | 93 | 93 |
| secretary_logs | 63 | 63 |
| security_audit_logs | 844 | 844 |
| sessions | 12 | 12 |
| skill_proposals | 3 | 3 |
| tasks | 19 | 19 |
| users | 8 | 8 |
| user_roles | 9 | 9 |
| work_sessions | 27 | 27 |

Working DB: **zero tables removed, zero demo records removed**. Employees,
users, attendance, work sessions, employee tasks, audit, password hashes and
APP_KEY were not modified by this task. Railway, remote databases and Google
Drive were not touched. No push/deploy or Phase 1C execution was performed.
Deleted legacy source files remain recoverable from Git history.

## Resume requirements

1. Resolve the failing test/permission fixtures; rerun the entire B1 gate.
2. Recheck exact local environment, backup hash/readability and Phase A
   inventory/provenance. If data differs, stop and report; do not infer consent.
3. Only after B1 passes, perform approved child-first operational reset and
   provenance-scoped AI/approval/notification cleanup. Remove 労災事故 only
   after checking all references. Do not delete 継続技能.
4. Reseed approved masters and apply the single cleanup migration with a
   one-process `THEMIS_V2_CLEANUP_APPROVED=1` opt-in. Never persist that opt-in
   on Railway/production. No migration-ledger edits, `migrate:fresh` or
   historical migration deletion.
5. Recheck zero operational counts, master uniqueness, orphan FKs and
   preservation of protected data. Complete tests/build/application verification.

The migration only allows the exact approved local MySQL DB with opt-in, or
isolated testing on SQLite `:memory:` / the exact temporary MySQL DB above.
It is deliberately irreversible; rollback requires a separately authorized
restore of the verified backup, not recreation of empty legacy tables.
