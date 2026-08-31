# THEMIS V2 · 資料収集 — UI review prototype

Status: **mock only**, 2026-08-31. Not a production integration.

## Preview

- App route: `/design/case-document-collection` (inside the existing ProtectedRoute and MainLayout).
- Local: `http://localhost:5173/design/case-document-collection`. Sign in normally first.
- Standalone visual fixture: `http://localhost:5173/tests/fixtures/document-collection.html` (Vite development only; excluded from production build entries).
- The fixture has no AuthProvider, account data, API calls or second sidebar. It reserves the existing sidebar's 288px desktop width to test available content space; the real route reuses Sidebar, MainLayout and ThemeProvider unchanged.
- Production builds retain the existing `/DEMO-WEB/` base. The preview feature is lazy-loaded.

All controls in the feature operate on React state. Reloading restores fictional data. No API, localStorage persistence, upload, generator, approval execution, external sending or AI legal decisions. The surrounding authenticated app retains its normal session behavior.

## Review flow

1. Start with **対応中の案件 / 労災**: 55 official candidates plus one separately scoped Kyoto hospital item = 56 collection items. Counts are calculated, not fabricated KPIs.
2. Search `D-003`: Osaka / January–March and Kyoto / April–June are separate items. Select one to inspect A–G sections.
3. Search `D-001`: partial receipt + insufficiency, one received file with W1 and W3 references. No second copy for the second purpose.
4. Search `D-002`: received but **未確認**. Search `W-202`: **必要 / 終了 / 不存在**, not 不要.
5. Use 保全優先 or 期限超過 for `W-210`. Inspect the separate lawyer approval section; there is no send button.
6. Change necessity with a reason and choose **デモに反映**. 不要 appears in the final muted group. Reset/cancel remains mock state only.
7. Register a mock filename or HTTPS link in F. No real file chooser/upload or external navigation. Re-registering the same filename increments its demo version.
8. Select **リスト未作成** → **資料収集リストを作成**. All 55 (or 48 traffic) items begin undecided with no inferred dates or received files.
9. Switch to **交通事故**. Conditional W-301–W-304 are included, not a wholesale copy of the workers' compensation checklist.

The displayed review date and actor/time examples are intentionally fixed fictional scenario data, not the current logged-in employee or real operation timestamps. Approval selection is explicitly a display-scenario selector, not an approval action. Access labels do not enforce permissions.

## Layout / interaction decisions

- Compact case header and existing-shell context; six understated workspace tabs. Other tabs explicitly identify themselves as out of scope and return to 資料収集.
- Compact summary, search, five expandable filters and four quick filters. Status filter values include the axis so necessity 未判定 cannot accidentally match sufficiency 未判定.
- Purpose groups show each collection item once using its first official purpose as the primary group; additional purposes stay visible and searchable. Unnecessary items have a separate bottom group.
- Four independent status axes remain labeled on every row. Exceptions and external approval are separate indicators, never collapsed into generic progress.
- Desktop ≥1280px: flexible master list + 420px inspector. Each scrolls independently; local form actions stay at the inspector footer.
- Tablet: 440px right modal drawer, backdrop, focus trap, Escape, focus restoration and body scroll lock.
- Mobile <768px: full-width detail; narrow lists transform to stacked rows using container queries. Header tabs wrap rather than overflowing. Initial top clearance accommodates the existing mobile menu button.
- Light/dark use scoped neutral surfaces and readable status colors. Semantic text supplements color; native controls and visible keyboard focus. Existing global shell and theme implementation are untouched.

## Official source and fixtures

`officialCandidates.ts` is a checked-in, read-only UI snapshot of the audited Phase 1C JSON files:

- `backend/database/seeders/data/document_type_master_v1.json`
- `backend/database/seeders/data/case_type_document_rule_master_v1.json`

Source: 事件類型別 資料収集マスター, v1.0, 2026-08-30, SHA-256 `ac510b45971bf4bf8a17c3689d33fb80b4b925b7638c856bf6a51705265ddfb9`.

The 103 entries preserve names, purposes, applicability guidance, source/target/scope, version and preservation flags. They are **not runtime imports from backend**, not a second master database and not a frontend implementation of generator inheritance/precedence. Labels for purpose group headings are shortened for display. Tests compare every fixture entry to the checked-in official JSON. Fictional operational overrides live separately in `mockData.ts`; they never mutate the source fixtures.

## Acceptance mapping

| Requirement | Visible representation |
| --- | --- |
| AC-01 | 労災 55 / 交通事故 48 selector; COMMON plus domain purpose groups; explicit uninitialized/create flow. |
| AC-02 | Fresh items all 未判定. Unknown condition is not inferred as 不要. Required/unnecessary decisions need a reason. |
| AC-03 | Traffic W-301–W-304 retain conditional guidance; shared D codes are not duplicated by purpose. |
| AC-04 | Dedicated authorization section and distinct A-003 scenario; explicit warning that C-002 is not a universal substitute. |
| AC-05 | D-003 Osaka and Kyoto, separate periods and item IDs. Candidate count stays 55; extra scoped item counted separately. |
| AC-06 | D-001 W1/W3 references on one item/file; W-103 also references both purposes. |
| AC-07 | Partial/insufficient D-001, missing-page Kyoto D-003, nonexistent W-202, partial nondisclosure W-201, difficult W-106; separate exception and reason history. |
| AC-08 | Separate approval status, approver display, explicitly DRAFT context actions. No external send/submit control in any scenario. |
| AC-09 | Inspector “案件担当者のみ” with explicit demo-permission qualifier. No production permission change. |
| AC-10 | Saved v1 rule/source/condition context; versioned received files and reviewer/actor/time history; editing a scenario does not mutate the master. |
| AC-11 | Purpose/source/axis-status/assignee/deadline filters; preservation/overdue/attention/undecided quick filters. |
| AC-12 | Multiple file versions, mock HTTPS links, original/copy metadata, C-001 original-return record and history. |

## Files

Feature directory: `EmployeeManagement/frontend/src/features/document-collection-mockup/`

- `DocumentCollectionMockupPage.tsx`: orchestration, scenario selector, case header, summaries, preview-only tabs.
- `CollectionList.tsx`: toolbar, independent filters, groups and accessible selectable rows.
- `CollectionDetailDrawer.tsx`: A–G workflow, editing, draft/reason history, focus behavior.
- `ReceivedDocumentsSection.tsx`: mock received files, versions and links.
- `types.ts`, `officialCandidates.ts`, `mockData.ts`: isolated typed fixtures and pure filtering helpers.
- `documentCollectionMockup.css`: feature-scoped responsive/light-dark styling.

Only existing application file modified: `frontend/src/App.tsx`, for the lazy protected preview route. Test additions: `tests/documentCollectionMockup.test.mjs` and `tests/fixtures/document-collection.{html,tsx}`.

## Verification

- `node --test tests/*.test.mjs`: 28 passed, including 6 collection-prototype tests (103 official rule comparison, fresh defaults, all 13 scenarios, conditional cross-domain candidates, axis-aware filters and fixture isolation).
- Targeted ESLint: `npx eslint src/features/document-collection-mockup src/App.tsx`.
- Frontend build: `npm run build`. Existing main-bundle >500kB warning remains; mock code/styles form a separate lazy chunk.
- Browser checked standalone fixture at 1440×1000, 1024×900, 768×1000 and 390×844, light/dark. Checked page width, list/detail rendering, search, combined filters, 不要 movement, mock file-link save, explicit creation, traffic count, modal focus loop and Escape.
- Screenshots are local review artifacts in ignored `outputs/document-collection-mockup/`. They show the standalone content harness, **not proof of end-to-end authentication or production API behavior**. Full authenticated-shell visual verification needs a signed-in session; source route/layout wiring is preserved.

No backend changed. No generator invoked. No database records created. No external send or AI legal determination. Production CaseWorkspacePage is not replaced. No deployment or production integration is authorized by this prototype.
