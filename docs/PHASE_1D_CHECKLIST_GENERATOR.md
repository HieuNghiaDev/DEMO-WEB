# Phase 1D — backend checklist generator

Verified 2026-08-31. Backend service only; no frontend or automatic deployment.

Phase 1E-B update: the historical verification below describes Phase 1D. Explicit preview/initialize HTTP endpoints now wrap the same generator; see [API.md](API.md#v2-checklist-initialization--phase-1e-b). `previewForCase()` and generation share private `plan()` for resolution and duplicate/safety checks. Planning errors use `ChecklistPlanningException` (a RuntimeException subtype) so HTTP callers can return a safe 422. Metadata is checked before inserting missing candidates. Generation locking/defaults/idempotency remain unchanged; Phase 1E-A0 additionally copies primary-rule preservation_priority on new items. CaseFile creation is still not connected to V2 generation.

## Entry point and initialization boundary

`EmployeeManagement/backend/app/Services/CaseDocumentChecklistGenerator.php` exposes:

```php
// Application caller must already have authorized access to this persisted case.
$result = app(CaseDocumentChecklistGenerator::class)->generateForCase($caseFile);
```

Result keys: `created_count`, `skipped_count`, `candidate_count`, `created_case_document_ids`.
Candidate count is the effective, deduplicated document set before checking existing case items;
created + skipped = candidate count. Created IDs refer only to this invocation.

**Not automatically attached to CaseFile creation in Phase 1D.** The existing controller creates the case,
then calls `CaseDocumentChecklistService::applyDefaultTemplate`. That legacy workflow produces items keyed
by `template_item_id` without `document_type_id`. Running both paths would duplicate overlapping documents;
replacing the template path would change existing creation/API/UI behavior. The separate public service is
the dedicated application action permitted by this phase, not an HTTP endpoint or scheduled job.
Its algorithm is not in a controller. Existing POST creation and apply-template behavior remain unchanged.
Future integration must explicitly decide how the two engines coexist and wrap client/case creation and
initialization in the same caller transaction. Nested-transaction rollback is verified here.

## Lineage and selection

1. Start a transaction on the case's database connection; reload and lock the persisted, non-deleted CaseFile row.
2. Read its current `case_type_id`, not a stale caller attribute/relation or the legacy display string `case_type`.
3. Follow `parent_id` from selected type to root. A visited-ID set rejects cycles; missing nodes fail with a clear runtime error.
4. Select rules with `is_active=true` and inclusive effective bounds on `today()` using application timezone
   (`config/app.php`: `APP_TIMEZONE`, default Asia/Tokyo), consistent with the legacy template service.
5. For each document at each level, select the highest active/effective version. Inactive, expired and future versions do not override a usable rule.
6. Nearest level wins primary metadata even if an ancestor has a higher version number. Within levels, sort_order then rule ID determines display order.
7. Union unique purpose IDs from those per-level winners. Do not union superseded versions at the same level.

Purpose union preserves descriptive confirmation purposes for the same document definition. It does not
assert all purposes are necessary, merge parent conditions into child conditions, or infer applicability.
Only the primary rule supplies source/person/scope/condition/version/provenance/priority. No numeric IDs or domain names are hard-coded in the service.
Rule active/effective flags govern selection; the service does not add a separate activity filter on linked document or purpose masters.

Null case_type or no matching rules returns an all-zero result. Unsaved/deleted/missing case, malformed hierarchy,
missing document definition, incompatible source/person length or unsupported priority fails and rolls back.

## Defaults and snapshots

- FK: current case, document definition and primary rule. `is_template_generated=true`; `template_item_id` remains null.
- Title: document type `name_ja`; legacy category `チェックリスト`, status `not_requested`, version `1`, requirement_level `conditional`.
- Independent axes: necessity `undetermined`, collection `not_started`, fulfillment `undetermined`, review `unreviewed`.
- `rule_version_snapshot`, `applicability_condition_snapshot`, `rule_source_snapshot` copy primary version/condition/master_source once.
- `collection_source` and `target_person` copy source/target suggestions; they remain case-editable.
- `target_scope` copies descriptive `standard_period_rule`; both actual period dates remain null. No dates are calculated.
- `collection_priority` copies the compatible rule priority. Official W-210, T-103 and T-104 retain high priority.
- `preservation_reason` stays null: rule master has a boolean priority flag but no dedicated reason text. No invented explanation.
- Purpose union is attached through `case_document_purposes`; no JSON/text purpose snapshot or duplicate links.
- No organizations, people, received files, tasks, external requests or approval actions are created.

Source/person master fields are TEXT, while existing case fields are VARCHAR(255): an oversized value is refused,
never truncated. A failure after earlier candidate inserts still rolls back the whole generator transaction.

## Idempotency and preservation

Existing documents are read with `withTrashed()` and a locking read after the case lock.
An existing generated item with the same document type **or** primary rule ID blocks another automatic item.
Version changes, operator edits, newly-added child overrides and case-type changes do not invalidate that guard.
The document ID still protects history if its rule FK was nulled by deletion.
Soft-deleted generated items block regeneration and are not restored.

Existing rows are never filled/saved/synced by the generator. This preserves all decision axes, reasons,
source/person/period/scope edits, notes, snapshots, purpose links and timestamps. Removed/deactivated rules
do not delete case history. Newly selected document definitions can add missing candidates only.
Case-type reconciliation, restoring removed items, and applying updated master versions require a future explicit review workflow.

**No schema change and no global UNIQUE(case_file_id, document_type_id).** Two manual hospital/person/period
contexts for the same document definition remain valid. One automatic initial suggestion per document type
is the service's policy, not a business-wide uniqueness rule.

### Narrow manual duplicate check

Skip a candidate only for a non-deleted manual item with the same document_type and matching trimmed
source/person/scope, no concrete period dates, and compatible snapshot values (null or equal to the primary rule).
Null and empty suggestion text are treated alike. Do not convert or update the manual item or attach purposes to it.
Different source, scope, concrete dates or explicit snapshot context allows an additional generated suggestion.
Deleted manual rows do not block it.

This is not a semantic/fuzzy duplicate engine: title-only legacy items, provider aliases and equivalent date
descriptions are not reconciled. Blank contexts are compared as unspecified values, not proof that real-world
documents are identical. A later change to manual context can therefore permit a new suggestion.

## Transactions / concurrency

All candidate creation and purpose attachment occur in one transaction. The CaseFile row uses `FOR UPDATE`
on MySQL, serializing callers of this service for that case; the subsequent documents query is also a locking read.
Repeated calls inside an outer transaction are idempotent and roll back with that caller.
Manual writers that do not acquire the same case lock are outside this concurrency guarantee.
No distributed locks, new indexes, cross-system side effects or concurrency infrastructure were introduced.

SQLite tests do not simulate real concurrent InnoDB requests. Additional isolated MySQL verification observed
the actual parent `FOR UPDATE` query and repeated generation for all four official parent/subtype scenarios.
This is a locking/idempotency verification, not a two-process race/load test.

## Verification results

`tests/Feature/CaseDocumentChecklistGeneratorTest.php`: **21 tests / 154 assertions PASS**.

| Scenario | Result |
| --- | --- |
| 労災 direct parent | 55 candidates; second run creates 0 |
| 交通事故 direct parent | 48 candidates; second run creates 0 |
| 後遺障害 subtype | Inherits 48 traffic candidates |
| 障害（補償）給付 subtype | Inherits 55 workers-comp candidates |
| Conditional and cross-domain rules | Present, undetermined, condition snapshot retained |
| Multi-purpose | One item per type; C-002 COMMON+W4 and D-001 W1+W3 |
| Child override / multi-level / versions | Nearest metadata; purpose union; superseded version purposes excluded |
| Effective dates | Inclusive bounds, inactive/expired/future exclusion, parent fallback |
| Operator decisions / soft deletes | Rows, snapshots, purpose links and timestamps unchanged |
| Master changes / new version | Existing snapshots and purposes untouched |
| New rule / removal / case-type change | Additive only; old items retained |
| Manual same-document-type items | Independent sources/scopes coexist; only exact context skipped |
| Null type / no rules | Zero result |
| Cyclic / missing hierarchy / invalid case | Safe error, no partial checklist |
| Insert failure / purpose failure | Entire generator transaction rolled back |
| Oversized source | Error instead of silent truncation; earlier inserts rolled back |
| Repeated nested transaction calls | Idempotent; caller rollback removes all generated data |

Full backend: **213 tests / 1,465 assertions PASS**, including existing workspace/API regressions.
Scoped Pint: PASS. Frontend production build: PASS; existing 657.79 kB JS chunk warning (>500 kB), no frontend source changes.

Isolated MySQL `employee_management_v2_test_migration_chain`: same four official counts and second-run zeros;
all temporary client/case/document/purpose rows rolled back. Its missing Phase 1D-0 additive snapshot migration
was applied before verification; no seed or reset. Auto-increment gaps in this test DB are expected after rollback.

Working `127.0.0.1 / employee_management`: read-only checks only. Master checksums match Phase 1D-0,
with **document_types=78, document_purposes=11, rules=103, rule-purpose links=107**.
**clients=0, case_files=0, case_documents=0**. No verification records were inserted in the working DB.
Ignored verification artifacts are in `backups/themis-v2-20260831/phase1d-*`.

Necessity was never inferred automatically. Existing case decisions were never overwritten.
No master edits, global uniqueness, reset, operational demo records, frontend, OCR, AI decisions,
external sending, Railway access/deployment or next phase was performed.
