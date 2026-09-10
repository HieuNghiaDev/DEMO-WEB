# C-001 end-to-end verification and immutability audit

Date: 2026-09-05. Scope: local validation and narrowly scoped bug fixes. No deployment, push, PDF, Drive, new document types or schema migration.

## Environment

Laravel runtime bootstrapped with read-only database queries: environment `local`, driver `mysql`, host `127.0.0.1`, database `employee_management`. Frontend development API URL is `http://127.0.0.1:8000/api`. Automated Laravel tests use SQLite `:memory:` as configured in phpunit.xml, not the local application database.

## BROWSER E2E

| Check | Result | Evidence |
| --- | --- | --- |
| Draft persistence | PASS | Existing case 33 / C-001 item 349, D 文書作成 → editor → save; MySQL instance 1 stored draft and Unicode notes. Reload and navigation away/back retained notes. |
| Review persistence | PASS | Required date validation displayed without a false success. Date entered through native keyboard interaction; review A4 displayed values, MySQL workflow was review, reload retained date and notes. |
| Approval persistence | PASS | On reopening the tab, instance was already approved. Approved view survived another reload, no approval button remained, and panel showed 承認済み / 文書を見る. |
| Reload behavior | PASS | Observed persisted draft, review and approved states through fresh browser loads. |

Limit: the uninterrupted browser sequence 編集に戻る → 確認へ → 承認する was not fully observed. After the edit-back action and a user continuation, the previous tab was unavailable; opening a new tab found the document already approved by user 14 (THEMIS MANAGER). Do not interpret the persistence PASS as proof that every approval click was executed/observed by the agent. The edit-back/value preservation and approval transitions are covered by API tests. Logout/login was not tested; existing authentication was preserved.

MySQL briefly stopped accepting connections during navigation. The application showed a real connection error instead of success. The operator restarted MySQL; retry restored the saved draft. Native date fill initially updated the DOM without React state in browser automation; keyboard ArrowUp/ArrowDown committed the date correctly. No application workaround was added for that automation behavior.

## SNAPSHOT IMMUTABILITY

- Client change: PASS — isolated Laravel test changes Client after approval and asserts the exact original approved JSON from a fresh GET.
- CaseFile change: PASS — same controlled fixture changes case title; snapshot remains exactly the approved draft.
- Approved renderer: PASS — real store test deliberately supplies different draft/snapshot values; display selects approvedData, missing snapshot fails closed. Browser approved view shows saved values. Header context also uses snapshot source mappings when approved.
- Existing local Client/CaseFile data was not modified for mutation tests.

## TEMPLATE IMMUTABILITY

- Version pinned: PASS — automated test approves v1, adds test-only v2, verifies old instance still uses v1 and a new item uses v2.
- Used template immutable: PASS at Eloquent model layer. Published content/identity is immutable from insertion, preventing a check-for-usage race. is_active may change independently.
- Seeder overwrite risk: NO after fix; previously YES (`updateOrCreate`). Seeder now uses `firstOrCreate`, preserving existing content, timestamps and active state.
- No v2 was inserted into local MySQL; it still has one generation template, v1.

Important boundary: model events do not protect raw SQL, bulk query-builder updates or saveQuietly. There is no database immutability trigger. All future template tooling must respect version creation. Name/code still come from document_types and renderer implementation remains code-version dependent; long-term pixel-identical reproduction is not guaranteed yet. template_body remains a neutral skeleton, not an official contract body.

## WORKFLOW PROTECTION

- Approved → draft blocked: PASS (422 under transaction lock).
- Approved → review blocked: PASS (422 under transaction lock).
- Double approval safe: PASS for repeated API calls; second call returns 422 without changing snapshot, actor or timestamp.
- One current instance: PASS — repeated GET has no writes, repeated draft save reuses the record, duplicate insert fails unique constraint.
- Transactions lock the parent checklist item and instance; a synchronous frontend ref also blocks repeated actions before React re-render. True simultaneous independent MySQL request stress testing was not performed.
- Other collection states stay independent: PASS in tests and local inspection.

## SECURITY

- Cross-case: PASS — GET creation/approved, PATCH draft, POST review/approve reject foreign case/document combinations with 404.
- Authorization: PASS — case.view-only level_2 can read but gets 403 on draft/review/approve. No permission changes were made.

## SESSION STORAGE

- Source of truth: API.
- Legacy overwrite risk: NO in document-generation flow.
- Removed unused readLegacyPrototypeDraft helper. No generation code reads/writes sessionStorage or automatically imports prototype data. Existing legacy browser keys are not deleted; they are ignored.
- The shared API client's session/local storage for authentication remains intentional and unrelated to document persistence.

## Error handling

Validation, unsupported document writes, cross-case, permission denial, invalid transitions and approval rollback are covered by API tests. Store tests check rejected load/save/review/approve promises without changing input data. Editor clears old success notices before requests, applies state only after success, preserves entered values on rejected saves, and prevents navigation during its save. Panel hides unverified statuses during loading/failure and offers retry. Browser-tested failures were required-date validation and the actual database outage; other failure variants were not individually forced in the browser.

## BUGS FIXED

1. Approved documents could silently return to draft/review.
2. Template seeder could overwrite an existing published version.
3. Published template content had no model-level edit guard.
4. Approved rendering used editable draft rather than approved snapshot; missing snapshot now fails closed.
5. Old success notices could survive a failed request; duplicate action guard used only async React state.
6. Panel retained prototype wording and could reuse stale document status on identity changes; keyed state and retry added. Editor also remounts for a different case/document identity.

## FILES CHANGED

Relative to repository root:

- EmployeeManagement/backend/app/Http/Controllers/Api/CaseDocumentCreationController.php
- EmployeeManagement/backend/app/Models/DocumentGenerationTemplate.php
- EmployeeManagement/backend/database/seeders/DocumentGenerationTemplateSeeder.php
- EmployeeManagement/backend/tests/Feature/CaseDocumentCreationApiTest.php
- EmployeeManagement/frontend/src/features/document-creation/DocumentEditorPage.tsx
- EmployeeManagement/frontend/src/features/document-creation/documentDraftStore.ts
- EmployeeManagement/frontend/src/features/document-creation/components/DocumentCreationSection.tsx
- EmployeeManagement/frontend/src/pages/BusinessQuest.tsx
- EmployeeManagement/frontend/tests/documentCreation.test.mjs
- docs/API.md
- docs/DATA_MODEL.md
- docs/DOCUMENT_GENERATION_IMMUTABILITY_AUDIT.md

Existing unrelated working-tree changes were preserved.

## DATABASE CHANGES

No schema changes, migrations or local seeders. No deletion/cleanup. Browser test saved instance 1 for existing case 33 / case_document 349. At final inspection it is approved, template ID 1/version 1, approved_by 14, approved_at `2026-09-05T03:32:11.000000Z`; approved_data exactly equals draft_data. One instance and one template exist. Test notes explicitly identify this as local verification, not a formal contract. The approved record is retained.

Collection statuses remain required / preparing / satisfied / reviewed, matching the initial inspector. No Railway, production, PostgreSQL or backup changes were performed.

## TEST RESULTS

- Targeted generation + collection API + collection fields + initialization: **148 PASS, 2116 assertions** (generation file contains 12 tests).
- Full Laravel suite: **378 PASS, 1 FAIL, 3772 assertions**.
- Remaining failure: LocalV2MigrationPathTest expects migration `2026_08_31_120000_remove_legacy_matter_tasks` absent. The existing legacy migration is unrelated to generation and was not changed.
- Frontend document-generation tests: **4 PASS** (transport unit tests plus source guard assertions, not mocked browser E2E).
- Frontend collection regression: **20 PASS**.
- TypeScript + Vite build: **PASS**. Existing >500 kB chunk warning remains.
- Targeted ESLint: **PASS**.
- Laravel Pint on changed PHP files: **PASS**.
- git diff --check: **PASS**, with existing line-ending warnings. Untracked files are not covered by git diff.

## Remaining known issues / next step

The legacy migration test, raw-SQL immutability boundary, historical title/renderer reproducibility and incomplete uninterrupted browser approval click trace remain as noted above. No official legal contract body, PDF, or Google Drive was added.

Next recommended step: generic PDF generation using approved_data and the pinned template, after agreement on historical renderer/master metadata requirements. Not implemented in this task.
