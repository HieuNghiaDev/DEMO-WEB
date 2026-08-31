# THEMIS V2 — Phase B2 local cleanup report

> Subsequent finalization removed the already-applied local cleanup migration
> from the normal deploy chain. Its local history row remains unchanged.
> See [V2_MIGRATION_PATH.md](V2_MIGRATION_PATH.md); B2 was not rerun.

**Completed on local development only. STOP before Phase 1C.**

## Environment and backup

- Environment: `local`; MySQL host `127.0.0.1`; database `employee_management`.
- Tables: **50 → 48**. Migration ledger: **53 → 54**.
- Verified backup:
  `D:/project/procet_web/backups/themis-v2-20260831/employee_management-before-v2.sql`
  (520,581 bytes, readable, complete SQL dump).
- SHA-256 unchanged:
  `8edd52fdd2e42d02fe53e7b4d991a5fe4dd438f975e0751a7b8c6660b99291e8`.
- All approved operational row contents matched the backup, not just counts.
  Provenance/action/reference checks were performed for AI records and
  notifications. All current rows were locked and rechecked against the
  immediate pre-cleanup snapshot inside the deletion transaction.

Preflight found expected ongoing-session metadata drift since the old backup:
two existing cache values/expirations and token 180's `last_used_at/updated_at`.
There were no new/deleted cache keys or token IDs, and no token credential,
identity or expiry changes. Current system rows, not backup-era metadata,
were snapshotted for preservation. No unexpected case/demo records were found.

## Removed records and final counts

Raw query-builder deletion included soft-deleted demo rows. Case-domain schema
was retained; only the legacy `tasks` and `matters` tables were dropped.

| Table | Before | Removed | Final |
| --- | ---: | ---: | ---: |
| clients | 12 | 12 | 0 |
| case_files | 10 | 10 | 0 |
| case_documents | 22 | 22 | 0 |
| received_documents | 0 | 0 | 0 |
| case_document_received_documents | 0 | 0 | 0 |
| case_document_purposes | 0 | 0 | 0 |
| case_tasks | 2 | 2 | 0 |
| case_deadlines | 2 | 2 | 0 |
| case_activities | 19 | 19 | 0 |
| case_parties | 1 | 1 | 0 |
| case_custom_sections | 0 | 0 | 0 |
| case_precedents | 2 | 2 | 0 |
| case_meeting_logs | 4 | 4 | 0 |
| approval_requests | 9 | 9 | 0 |
| secretary_logs | 63 | 63 | 0 |
| skill_proposals | 3 | 3 | 0 |
| employee_notifications | 19 | 6 | 13 |
| tasks (legacy) | 19 | 19 with table | absent |
| matters (legacy) | 4 | 4 with table | absent |
| case_types | 29 | 1 obsolete category | 28 |

Approval provenance: three specific demo actions
(`demo_send_client_update`, `demo_publish_internal_summary`,
`demo_remove_draft_document`) and six `delete_task` approvals. Logs belong to
`task_management`, `morning_briefing`, or six null-skill tool logs with a
verified `delete_task` action and reference to an approved legacy approval.
All three proposals had `proposed_by=AI_DEMO_SEEDER`.

Only six `approval_request` notifications referencing the removed approvals
were deleted. The other **13 notifications are byte-content-equivalent by
canonical row SHA-256** to the pre-cleanup snapshot. Infrastructure tables for
approvals, logs, proposals, personas and notifications remain present.

Applied exactly the existing additive migration
`2026_08_31_120000_remove_legacy_matter_tasks.php`: **tasks → matters**.
Laravel updated its migration ledger normally. Historical migration files
were not removed or edited. There was no `migrate:fresh`, schema reset or
manual migration-ledger update. MySQL DDL is separately committed, not claimed
to be part of the data-deletion transaction.

## Preserved system and compatibility data

| Data | Before → after | Full-row SHA-256 |
| --- | --- | --- |
| users / employees | 8 → 8 / 7 → 7 | unchanged |
| offices / departments | 2 → 2 / 0 → 0 | unchanged |
| attendances / attendance_periods | 46 → 46 / 36 → 36 | unchanged |
| work_sessions / employee_tasks | 27 → 27 / 12 → 12 | unchanged |
| roles / permissions | 5 → 5 / 30 → 30 | unchanged |
| role_permissions / user_roles | 93 → 93 / 9 → 9 | unchanged |
| security_audit_logs | 844 → 844 | unchanged |
| document_templates / document_template_items | 16 → 16 / 83 → 83 | unchanged |
| document_name_catalog | 6 → 6 | unchanged |
| document_types / document_purposes | 78 → 78 / 11 → 11 | unchanged |

All 26 protected-table fingerprints matched immediately after cleanup, as did
unrelated notifications. After subsequent live verification, 24 still matched
exactly; only cache and existing token-use timestamps continued to change.
Read-only field-level comparison confirmed the same existing keys/IDs and only
the usage/cache fields described above. Those live changes were **not overwritten
or falsely reported as unchanged**. Token count remains 29 and cache count 20.
Users/password hashes, role mappings, audit rows and APP_KEY remain unchanged.

The tables `case_custom_sections`, `case_precedents`, `case_meeting_logs` and
both `case_documents.status` / `case_documents.file_url` fields remain.
No external Drive files were accessed or deleted.

## V2 master and final schema

- `case_files` remains the canonical **案件 / 事件** entity; `clients` remains
  the customer entity.
- `matters` and legacy `tasks`: **absent**.
- `case_tasks` and `employee_tasks`: **present**.
- `document_types`: **78 rows / 78 distinct codes**.
- `document_purposes`: **11 rows / 11 distinct codes**.
- `労災`: exactly one canonical parent, with
  `療養（業務災害・通勤災害）`, `休業（補償）給付`, `障害（補償）給付`.
- `交通事故`: exactly one canonical parent, with
  `傷害事故`, `後遺障害`, `死亡事故`.
- `労災事故`: removed only after every FK reference was checked clear.
- `継続技能`: retained, inactive. All other existing case-type names retained.
- Only `CleanV2MasterSeeder` ran; no employee/demo seeder ran.
- `case_type_document_rules` and its purpose pivot remain **0**; no Phase 1C
  労災/交通事故 rules were seeded.
- **62 FK column references checked; zero orphan references**.

## Post-cleanup verification

- Full backend suite: **PASS — 168 tests / 1,069 assertions** on isolated
  SQLite memory DB, including login/password, employee, attendance, employee
  task/notification, case/workspace/document, approval and disabled-AI tests.
- Frontend production build: **PASS**. Existing ~658 kB JavaScript chunk-size
  advisory remains; no frontend code was changed in B2.
- Local MySQL HTTP-kernel smoke: **15 requests PASS**, using an existing Level
  4 principal with middleware retained; no real credentials/passwords changed.
  `/me`, organization, attendance/history, own tasks, empty case list, empty
  approval list and persona API returned 200. Both legacy AI skills returned
  the intended 422 `ai_skill_unavailable` without provider calls.
- A temporary client/case was created through the API (201), parent/subtype
  relationship and workspace verified, then document create/update/list and
  Drive-URL metadata compatibility verified. All temporary rows were rolled
  back, leaving final operational counts zero. MySQL may consume auto-increment
  values even for rolled-back inserts; counters were not reset.
- The smoke harness injects an authenticated principal; it is **not** a claim
  of a manual browser login. Actual login flows are covered by the full test
  suite. No new browser visual verification was performed. AI/ApprovalRoom
  frontend build and backing APIs passed; disabled execution is covered by
  backend regression tests.

Evidence files under the ignored, private backup directory:
`b2-before.json`, `b2-data-deletion.json`, `b2-after.json`,
`b2-final-verification.json`, `b2-smoke.json`, `b2-tests.xml`.
These contain counts/checksums or test evidence, not dumped credentials.
The SQL backup contains sensitive data and must not be committed/published.

## Scope and stop

No runtime source, authorization, user password, APP_KEY, Railway configuration
or historical migration was changed in B2. One-off guarded operator/verification
scripts reside only in the private backup directory; documentation records
the result. Existing unrelated workspace changes were left alone.

**Railway untouched. No deployment, push, remote DB operation or Phase 1C.**
Deleted demo data can be recovered from the verified full backup via a
separately authorized restore; no automatic restore was performed.
