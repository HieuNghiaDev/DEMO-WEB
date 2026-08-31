# Phase 1C — Official document collection rules

Verified on 2026-08-31. Scope: canonical root **労災** and **交通事故**, candidate metadata only.

## Authoritative source

**事件類型別 資料収集マスター**, v1.0, 2026-08-30, `事件類型別-資料収集マスター.docx`.
SHA-256: `ac510b45971bf4bf8a17c3689d33fb80b4b925b7638c856bf6a51705265ddfb9`, matching the Phase 1B master.
The original DOCX paragraphs and all 97 document occurrences were read directly, including section-level conditions and AC-06. This is implementation of the supplied master, not a new determination of legal necessity.

The checked-in JSON preserves each contributing section and its original purpose/condition note under `source_entries`. Source notes in the existing document definitions remain unchanged. The source's proposed future UI/workflow is not authorization to implement Phase 1D.

## Counts verified in local MySQL

| Domain | Unique rules | COMMON | W1 / T1 | W2 / T2 | W3 / T3 | W4 / T4 | W5 / T5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 労災 | 55 | 4 | 7 | 17 | 21 | 6 | 3 |
| 交通事故 | 48 | 4 | 7 | 18 | 5 | 10 | 5 |

Total: **103 rules / 107 purpose links**. Purpose counts overlap, so do not add them to infer unique rule counts.
All 103 rules use `requirement_level=conditional`; none declares an always-required document.

### Multiple purposes: 4 rule identities

- 労災 / C-002: COMMON + W4.
- 交通事故 / C-002: COMMON + T5.
- 労災 / D-001: W1 + W3, explicitly supported by AC-06 (same payslip for working conditions and damages).
- 労災 / W-103: W1 + W3, explicitly supported by the W-103 note “損害算定にも共用する”.

All 16 D codes have one separate rule per domain and share the same existing document type ID. No new C/D definitions, no D-015.

### Cross-domain mapping

Only W-301–W-304 participate in traffic T4 in addition to their 労災 W3 rules.
T-404 explicitly requests these candidates when **業務中・通勤中等で労災が関係する場合**.
Each cross-domain rule retains that condition and its original W source/period context.
No W1/W2/W4/W5 rules are automatically inherited by traffic cases.

## Applicability conditions

`applicability_condition` is readable metadata, not an executable expression.
It preserves explicit restrictions and procedural checks. Traffic T2/T3 use the section-level human-injury/property-damage context; W5 retains the section-level lawyer-policy approval gate.
Null does not mean required; it means no additional condition was extracted into that field.
Full source notes remain in the JSON, even when they describe purpose rather than an applicability restriction.

- **労災: 27 non-null conditions** — A-001, A-002, A-003, A-004, C-002, C-003, D-009, D-010, D-011, D-012, D-013, D-014, W-105, W-201, W-202, W-204, W-206, W-207, W-208, W-209, W-212, W-216, W-217, W-401, W-501, W-502, W-503.
- **交通事故: 38 non-null conditions** — A-003, A-005, A-006, A-007, C-002, C-003, D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, D-009, D-010, D-011, D-012, D-013, D-014, T-101, T-103, T-105, T-106, T-201, T-202, T-203, T-204, T-301, T-302, T-303, T-304, T-305, T-404, W-301, W-302, W-303, W-304.

Total non-null condition metadata: **65**. This counts procedural restrictions as well as event attributes, not 65 independent legal rules.

## Sources, targets and periods

- `standard_source` retains the original 主な取得先 for all 103 rules; no person/organization records are created.
- `standard_target_person` is populated only for explicit subjects (identity-check client, wage earners, self-employed people, household workers, vehicle owner/user, identity/inheritance subjects). Other targets remain null; supplier does not imply subject.
- Period/scope guidance is populated only from the source. Examples: 労災 D-001 starts with at least the three months before the accident and may expand; traffic D-001 uses lawyer-specified scope, **not** the workers-comp three-month default. Medical institution/period/item scope and procedure/benefit scope are preserved where stated.
- No case-specific dates or effective dates are invented.

## Preservation priority

- 労災: **W-210** — explicit 保全優先 / retention and overwrite schedule.
- 交通事故: **T-103** — explicit 保全優先.
- 交通事故: **T-104** — source §1 identifies scene conditions as disappearing evidence; its own note requires recording differences between photograph time and accident time. This flag applies that general source instruction, not an invented deadline.
- These 3 rules have `preservation_priority=true`, `priority_default=high`. Remaining 100 are false/normal.

## Prerequisites: 0 hard FK relationships

No unconditional single prerequisite was asserted. The source calls for checking destination, procedure, scope, period and authority; personal copies/direct provision can differ from a new third-party request.

The existing single nullable FK cannot safely represent conditional, alternative or jointly required authorization documents:

| Source context | Distinctions retained; not forced into a single prerequisite |
| --- | --- |
| W-201/W-202/W-302 disclosure | A-001 disclosure authorization; A-004 destination forms/identity documents; A-002 only for a disclosure appeal. A-001 is not automatically required for an already-held copy. |
| Medical records in either domain | A-003 institution/period/consent scope; personal copies and new third-party acquisition are distinct. C-002 is not substituted. |
| Traffic accident certificate | T-101 / A-005 only for proxy application, not all acquisition routes. |
| Criminal records | T-106 / A-006 depends on custodian and procedural stage. |
| Insurer-held materials | A-007 depends on insurer, requested document and authority; no blanket FK for all insurer-related records. |
| Appeals and criminal complaints | W-401 concerns workers-comp benefit appeals, A-002 disclosure appeals; W-501 and W-502 have different submission destinations. W-503 can concern either procedure, so no false one-of prerequisite. |

These distinct authorization candidates and source notes are stored; no authorization schema/engine, external action or approval execution was implemented.

## Unmatched / unused codes

- Duplicate identities found: **0**.
- Unmatched official document codes: **0**.
- All 78 official definitions are used across the union of both domains.
- A code omitted from one domain remains available in the master; nothing is deleted.

- **労災: 23 intentionally unused** — A-005, A-006, A-007, T-101, T-102, T-103, T-104, T-105, T-106, T-107, T-201, T-202, T-203, T-204, T-301, T-302, T-303, T-304, T-305, T-401, T-402, T-403, T-404.
- **交通事故: 30 intentionally unused** — A-001, A-002, A-004, W-101, W-102, W-103, W-104, W-105, W-106, W-201, W-202, W-203, W-204, W-205, W-206, W-207, W-208, W-209, W-210, W-211, W-212, W-213, W-214, W-215, W-216, W-217, W-401, W-501, W-502, W-503.

## Seeder and migration safety

Files under `EmployeeManagement/backend/`:

- `database/migrations/2026_08_31_130000_identify_official_document_rules.php`
- `database/seeders/CaseTypeDocumentRuleMasterSeeder.php`
- `database/seeders/data/case_type_document_rule_master_v1.json`
- `database/seeders/CleanV2MasterSeeder.php`
- `tests/Feature/CaseTypeDocumentRuleMasterSeederTest.php`
- `tests/Feature/DocumentRuleIdentityMigrationTest.php`
- `tests/Feature/CleanV2Test.php`

Migration adds nullable `master_source` and unique `(case_type_id, document_type_id, version)`.
It refuses pre-existing duplicate identities **before** DDL; no deduplication/deletion.
Existing rows remain unclaimed (`master_source=null`). Ownership is not mass-assignable through the model.

Seeder resolves roots by exact name + null parent and types/purposes by code.
Missing/ambiguous root, missing code/purpose, or a custom identity collision aborts and rolls back the whole rule seed.
It updates only rows owned by `official-document-collection-v1`; custom rows and other versions remain untouched.
Purpose linking uses `syncWithoutDetaching`: missing official relations are added; custom links (including additional links to an official purpose) are not removed because the pivot has no per-link provenance.
No truncate, case mutation, parent inheritance or checklist generation.

The seeder is included after prerequisite masters in `CleanV2MasterSeeder`.
Standalone use after migrations and prerequisite masters:

```text
php artisan db:seed --class=CaseTypeDocumentRuleMasterSeeder
```

Master ownership does not claim source notes as executable/legal conditions. Updating the JSON under the same version updates that owned rule metadata only; existing case decisions are not copied or changed.

## Verification performed

- Targeted regression: **19 tests / 163 assertions PASS**.
- Full backend: **185 tests / 1,213 assertions PASS**.
- Scoped Pint: **PASS**.
- Frontend production build: **PASS**, existing 657.79 kB JS chunk advisory (>500 kB); no frontend source edits.
- MySQL test DB `employee_management_v2_test_migration_chain`: new additive migration + rule seed twice PASS, 48 tables / 54 migration rows.
- Working LOCAL DB `127.0.0.1 / employee_management`: same additive migration + rule seed twice PASS, 48 tables / 55 migration rows.
- Second seed did not change rule/pivot IDs, data or timestamps.
- All **45 other table fingerprints** remained unchanged during local application. Only rules, rule-purpose links and migration history changed.
- Final local `document_types=78`, `document_purposes=11`, `clients=0`, `case_files=0`, `case_documents=0`, `received_documents=0`.
- `matters` absent, legacy `tasks` absent; `employee_tasks=12` preserved.
- Historical retired 120000 migration row retained. No cleanup/reset was rerun.
- Test fixture proves pre-existing/soft-deleted cases, checklist statuses/links/purpose assignments and custom rules survive seeding.
- Duplicate-index upgrade test proves existing values survive; duplicate input is refused without schema/data changes.
- Initial read-only preflight stopped because table listing returned schema-qualified names; schema selection was made explicit before any write.
- Local generated verification JSON / JUnit live under ignored `backups/themis-v2-20260831/`; no secret data added to source.

No Railway connection/deployment, Git push, frontend/AI/approval execution change, Phase 1D, checklist generator or condition engine.

## Purpose inventory (source-auditable)

### 労災

- COMMON: C-001, C-002, C-003, C-004.
- W1: D-001, W-101, W-102, W-103, W-104, W-105, W-106.
- W2: W-201, W-202, W-203, W-204, W-205, W-206, W-207, W-208, W-209, W-210, W-211, W-212, W-213, W-214, W-215, W-216, W-217.
- W3: D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, D-009, D-010, D-011, D-012, D-013, D-014, D-016, D-017, W-103, W-301, W-302, W-303, W-304.
- W4: A-001, A-002, A-003, A-004, C-002, W-401.
- W5: W-501, W-502, W-503.

### 交通事故

- COMMON: C-001, C-002, C-003, C-004.
- T1: T-101, T-102, T-103, T-104, T-105, T-106, T-107.
- T2: D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, D-009, D-010, D-011, D-012, D-013, D-014, T-201, T-202, T-203, T-204.
- T3: T-301, T-302, T-303, T-304, T-305.
- T4: D-016, D-017, T-401, T-402, T-403, T-404, W-301, W-302, W-303, W-304.
- T5: A-003, A-005, A-006, A-007, C-002.
