# Phase 1E-C · Production 資料収集

Implemented 2026-08-31. The approved design is reused, not redesigned. The existing case header, sidebar, authentication, theme, and useful workspace tabs are preserved.

## Entry points and shared presentation

- Real workspace: 案件管理 → existing case → **資料収集** or **必要資料**. `CaseWorkspacePage` lazy-loads both production panels. 資料収集 owns candidate necessity decisions; 必要資料 owns acquisition, receipt, review and fulfillment for the same `case_documents` rows. The legacy 書類 tab is no longer exposed as a competing document workflow. The surrounding list/new/edit/detail shell remains described in [Phase 1E-C0](CASE_MANAGEMENT_UI.md).
- Design reference remains `/design/case-document-collection`; its scenarios and edits remain in memory.
- Both adapters use `document-collection/components/CollectionListView.tsx`, `InspectorShell.tsx` and `documentCollection.css`. Shared components accept typed display props and never import business fixtures. The mock-specific editing/received-file simulator is not used in production.
- Feature files: `types.ts` (API contracts), `labels.ts` (independent Japanese status maps), `api.ts` (existing Axios instance), `utils.ts` (display/draft allowlist), `errors.ts`, `hooks/useDocumentCollection.ts`, and focused toolbar/confirmation/inspector/editor/received-metadata/feedback components.

## Real API workflow

1. Read `GET initialization-preview` on entry. It does not create anything. The employee directory is read independently from the existing `/organization` API when `employee.view` is available; only ID/display name is retained for pickers.
2. Empty collection with missing candidates shows case type/count and **候補資料は自動的に「必要」には設定されません。** Editing permission is required to offer creation.
3. Native accessible confirmation dialog → empty-body `POST initialize`. Cancel performs no POST; an in-flight lock prevents duplicate submissions. Success/no-op feedback uses the actual response and refetches preview, collection and parent workspace. A populated collection with new candidates gets a compact **候補を追加** notice, not the empty screen.
4. Missing case type/no rules/deleted/manual/legacy warnings are read from preview. No rules means no misleading create button. Missing type prompts the operator and provides a read-only recheck. Phase 1E-C0 adds the authorized case editor in the surrounding workspace header; the collection warning and its API flow remain unchanged.
5. List filtering/search/sorting/page/summary are server-owned. Search debounces 300ms; changing filters resets page to 1. Stale GET responses are cancelled/ignored. All five status/result filters have their own axis labels and query keys. Overdue/preservation/undetermined quick filters use documented parameters. Source uses an exact-name input committed on blur/Enter because no source-options endpoint exists; no fake source catalog is introduced. Purpose options come from preview plus purposes returned by the current page, not a hard-coded master. No completeness claim is made for a cross-case/custom-purpose catalog.
6. Summary uses the response's case-wide summary, not loaded rows. Groups are presentation of the loaded page only: purposes sort by code, first purpose selects the group, other purposes remain visible on the same row. **CaseDocument.id is the identity**, never DocumentType.id. 不要 items appear in the final muted group on that page. Group counts are explicitly page-local; server pagination/order is not rewritten into a fictitious all-case list.
7. Selecting a row fetches detail; only the inspector loads. Separate local draft + deliberate Save sends changed fields from the explicit 18-field API allowlist. Cancel resets the draft. Duplicate Save is blocked; failures keep the draft and inspector, display associated validation errors, and focus the invalid field. Switching rows/closing dirty detail requires confirmation. Success refreshes detail/list/summary/workspace; failed follow-up GET is distinguished from a successful PATCH.

Date-only fields retain YYYY-MM-DD. Datetime controls display the operator's device timezone and send offset-aware UTC ISO values only when changed, preserving untouched timestamps. No artificial dates are generated. Period validation includes the existing counterpart. Not-required reason validation follows the backend's partial-update semantics; choosing undetermined leaves the server responsible for clearing reason/actor/time. Snapshot fields and decision actor/time are display-only.

## Split candidate and required-document workflow

The approved **資料収集** screen remains the canonical candidate list: its summary strip, server search/filter/pagination, purpose grouping, row density and necessity inspector are retained. Its default quick filter is `必要性 = 未判定`; the operator can intentionally switch to 必要, 不要 or すべて without deleting a candidate.

The top-level **必要資料** tab reads all pages from the existing collection API and includes only rows where `necessity_status=required`. It filters the same `CaseDocument.id` values in memory. It never duplicates a CaseDocument, creates a ReceivedDocument, uses localStorage, or persists a derived workflow state. Changing a candidate to 必要 therefore makes that exact row eligible for 必要資料 on the next read; 不要 and 未判定 stay outside it.

Necessary-document rows show the acquisition, review and fulfillment axes side by side. The operational inspector is read-first: acquisition conditions are text until **取得条件を編集**, result/exception editing is hidden until explicitly requested, rule/master context is collapsed, and history opens the existing case history tab. `一部受領` and `一部不開示` remain different fields; `受領済み` does not imply `充足`, and `充足` does not imply `確認済み`.

### Inspector and capability boundary

The candidate inspector still exposes the existing explicit 18-field changed-only PATCH. The 必要資料 inspector offers focused updates to acquisition conditions, acquisition status, review, fulfillment and result/exception through that same allowlist; it does not introduce autosave or another API contract.

| Capability | Existing persistence | UI behavior |
| --- | --- | --- |
| necessity, source, method, target/person/period/scope, assignee, deadline, priority, preservation | `PATCH document-collection/{item}` | Editable by `case.update`. |
| 取得作業, 結果・例外, 充足, 確認 | same PATCH; independent columns | Editable by `case.update`, shown as separate controls/row axes. |
| audit item history | case activity with `document_collection.updated` metadata | Read-only real events only. |
| received document metadata | detail `received_documents` relation | Read-only real metadata and safe external link only. |
| 依頼文案, 委任状準備, external-action approval, external send | no feature model/API | Clearly marked unavailable; no fake button, local state or send. |
| receipt registration/linking, additional request draft, return reason | no write endpoint | Clearly marked unavailable; the existing data is never fabricated or deleted. |

Read-only users retain both top-level document screens and real history/file metadata; only mutation controls remain disabled by the existing `case.update` convention.

The four axes, result, work priority and preservation flag stay independent. Overdue row styling uses the documented predicate (deadline past and collection status neither received nor closed), including not-required items; summary and overdue filtering remain server authoritative.

## Authorization, failure handling and truthful limits

- `case.update` controls read-only/edit UI; `case.view` and all enforcement remain backend responsibilities. No auth interceptor, role mapping or middleware changed.
- 401 offers login navigation; 403 explains missing permission; 404 explains missing/wrong-case item and allows returning to the case list for page failures; 422 shows safe field messages; network/500/429 provide retry. No raw response/model/stack dump is displayed. Failure to fetch employee options disables that picker without preventing other edits.
- Received documents are **read-only metadata** from detail, including version, original/copy, receipt/return, registered employee and relationship. Only returned safe http(s) external links are enabled; upload records never receive invented URLs. Empty files are truthful. No file upload/delete/link-write/pivot mutation.
- Existing workspace activities contain metadata. Inspector history filters `event=document_collection.updated` plus the exact numeric document ID; it displays real event title, content, employee and time, and links to the existing case history tab. There is no dedicated paginated item-history endpoint, and unlinked/legacy events are not guessed into an item's history.
- Authority/prerequisite execution, request drafting/sending, external approval and submission have no feature API; the inspector explicitly states unavailable and offers no mock action or fabricated history.
- CaseFile creation still does not call V2 initialization. No legal necessity inference, AI legal decisions, external sends, DB/master changes or deployment.

## Verification

- `node --test tests/*.test.mjs`: **57 passed**. Covers the existing New Case, document collection, theme and mascot suites plus required-only membership, stable CaseDocument identity and independent acquisition/result/review/fulfillment axes.
- Browser suite: `tests/documentCollection.browser.mjs`, seven exported groups, **42 checks**. Uses the supported Browser tab against `tests/fixtures/collection-api.html`, which renders the **production components and configured Axios client** with every transport request intercepted in memory. In addition to initialization/list/inspector/error/recovery/field checks, it verifies required-only rows, no duplicated item identity, read-first detail, real safe received-document links and absence of fake write actions.
- Visual checks on the production-component harness at **1440, 1024, 768 and 390px**, light and dark. The inspector is a dense right column at 1280px and above, a 420px overlay below 1280px, and full-screen on mobile. The 1024px check found and fixed a sidebar-width compression issue; required rows no longer collapse into vertical text. Mobile uses stacked cards without a horizontal form grid.
- This is **not** a claim of authenticated live-DB end-to-end verification: operational local cases remain empty, and this phase deliberately creates none. Production wiring uses the real API client; browser fixtures and request logs live under `tests/` only, excluded from production build entries.
- Targeted ESLint for all changed feature/workspace/test-fixture TS/TSX files passes. Repository-wide lint has three pre-existing errors: `OrganizationDesign.tsx` state update in effect; `tests/fixtures/office-switcher.tsx` and `theme-preview.tsx` Fast Refresh export rule. They are outside this task and left unchanged.
- Production build passes. Main bundle retains the pre-existing >500 kB warning; production collection and shared presentation are lazy chunks. No backend changes, so the backend suite was not rerun.

Run browser groups through the Browser skill's existing tab after opening the dev fixture at desktop width: `initializationChecks`, `listChecks`, `inspectorChecks`, `errorChecks`, `recoveryChecks`, `fieldChecks`, `requiredWorkspaceChecks`. Each resets only in-memory fixture state. Never point fixture operations at the working backend.
