# Phase 1E-C · Production 資料収集

Implemented 2026-08-31. The approved design is reused, not redesigned. The existing case header, sidebar, authentication, theme, and useful workspace tabs are preserved.

## PDF preview and receipt timezone repair (2026-10-15)

Collected-file registration converts offset-aware `received_at` to the application
timezone before writing the existing DATETIME column. UTC, explicit-offset and
legacy timezone-less input preserve the same intended instant across reloads.
No schema change or automatic correction/backfill of old receipt values occurs.

The shared authenticated Blob preview still validates PDF signatures, honors
authorization failures and revokes Blob URLs on close. A validated native PDF
frame is no longer hidden while waiting for an unreliable iframe `load` event.
When native PDF support is absent, the frame errors, or no load arrives within
eight seconds, the viewer lazy-loads `PdfCanvasViewer` with pinned `pdfjs-dist`
6.4.299. Its worker, CMaps, fonts and decoders are Vite-emitted local assets, not
CDN resources. PDF.js receives only the already-authorized Blob URL, never a
Drive share link or credentials. Native PDF behavior remains on supported browsers.

The fallback supports every page via previous/next controls, fit-width and zoom,
local download and an extracted-text alternative. A bounded page canvas avoids
rendering every page at once; cancellation queues prevent reuse of a canvas while
its prior render is settling. Closing destroys the worker; password/load failures
retain the existing retry/download error surface. A stable scrollbar gutter and
out-of-flow loading overlay prevent resize/render loops. Images retain decode
readiness/error handling, and the existing dialog focus/escape/scroll lifecycle is
preserved (including the new zoom select).

Regression coverage: `documentPreviewViewer.test.mjs` and the receipt-time API
round-trip test in `CaseDocumentCollectionApiTest`. Implementation follows the
[PDF.js display API](https://mozilla.github.io/pdf.js/examples/).

## Workflow synchronization audit (2026-10-09)

The Required Documents list, counts and status filters all consume the server's
`workflow_state.code`; per-file review labels remain a separate presentation.
Opening an inspector now refreshes the background list as well as detail. The
mounted list also revalidates on window focus / visible-tab return; listeners
and requests are cleaned up on unmount. A change in the selected item's server
workflow/file/task metadata revalidates inspector detail without remounting its
tabs or inferring a status in React. Existing upload/edit callbacks refresh list
and workspace; review continues to await both refreshes and report reload failure.

Local audit: case 49 / C-004 / document 826 / task 6 / submission 2 v1 already
persisted received/reviewing/undetermined + pending_review on task/file. The
backend list/detail and running UI returned 確認待ち, not 対応中. No local data
repair was needed or performed. An in-memory test reproduces stale mounted
list state after another writer changes the server; focus/open revalidation
fixes that specific synchronization gap. This does not establish the cause of
an older screenshot or add push updates while a window remains continuously active.

Manual task re-upload now clears the old fulfillment assessment to undetermined
inside the existing upload transaction. Generated workflow/PDF/Drive are unchanged.
Targeted C-004 API matrix tests cover accept, upload, confirm, return, re-upload,
list/detail parity, audit and immutable old versions. Frontend tests cover mounted
refresh lifecycle and canonical row/count/filter/inspector metadata.

## Collected-file review / return (2026-10-09)

This revision supersedes the older Task-only review boundary below **for collected/manual
files only**. Generated-document approval remains in its existing flow.
Case-visible required-document progress now includes status/assignee/deadline/file/update
metadata regardless of task assignment. Private Task lists/descriptions and drawer navigation
remain permission-filtered. Inspector actions use backend capabilities, failing closed if the
older API omits them; ordinary viewers do not receive upload/review actions.

`FileReviewActions` adds compact return/confirm controls below the files in the existing
inspector, no redesign. The required reason/optional detail form reuses global `ModalShell`
(body portal, modal layer, scroll lock, focus handling); no second modal framework. Returned
files show the reason/detail and capability-gated `新しいファイルをアップロード`.
Both actions require explicit confirmation before a review POST. Confirm opens a compact
dialog showing the document code/name and file version. Return uses its reason form as the
single final confirmation (`差し戻しを確定`), not an additional dialog. Cancel/X/Escape/backdrop
follow `ModalShell` conventions and never save. Pending requests lock submit/cancel/dismissal;
save failures keep inline errors in the dialog. The target is bound to the opened file ID,
source and version; a background change requires reopening rather than reviewing another file.
Only the latest pending file is actionable. Manual approved versions say **確認済み**.
Existing versions retain their individual review status and preview/download behavior.

New received registrations create immutable versions and link the existing task submission
when applicable. Local linked submissions resolve the authenticated received-file download,
never a generated PDF substitute. Review responses replace inspector detail and trigger the
existing parent list/workspace refresh, so KPI/filter counts use the new API workflow state.
Unbound documents fall back to published document assignment/deadline/file metadata.
File history uses existing activity actor/title/content/time and includes numeric document
ID events; no fake upload history or past reviewer is created for legacy records.

Required-document inspectors (including C-001) use 概要 / ファイル / 履歴, with no
separate 作業 card or tab. Assignment/deadline controls stay in 基本情報; unique
acquisition/source/target/period/scope metadata is disclosed there with the existing
permission-gated editor. Generation/edit/version/review operations stay in ファイル.
関連タスク renders only when a related task exists, never an empty creation card.

Migration `2026_10_09_100000_add_collected_file_review` is required before using the new
backend contract. The 2026-10-09 local confirmation repair applied only this existing
additive migration to the verified localhost development database. No production or
Railway migration, push or deployment was performed.

Review responses are serialized inside the review transaction, so a response failure
rolls back the file, document, task and audit together. `FileReviewActions` awaits the
required list and parent workspace refresh separately from the review POST. Failed
saves retain pending state and use localized review errors. A successful save followed
by a failed refresh retains the server-confirmed detail, shows
`保存は完了しましたが、最新情報の再取得に失敗しました。`, and offers a refresh-only
retry (never a second review POST). A synchronous in-flight guard prevents rapid clicks;
repeated confirmed-file requests keep the existing controlled 422 validation response
and do not duplicate history.

## Entry points and shared presentation

- Real workspace: 案件管理 → existing case → **資料収集** or **必要資料**. `CaseWorkspacePage` lazy-loads both production panels. 資料収集 owns candidate necessity decisions; 必要資料 owns acquisition, receipt, review and fulfillment for the same `case_documents` rows. The legacy 書類 tab is no longer exposed as a competing document workflow. The surrounding list/new/edit/detail shell remains described in [Phase 1E-C0](CASE_MANAGEMENT_UI.md).
- Design reference remains `/design/case-document-collection`; its scenarios and edits remain in memory.
- Both adapters use `document-collection/components/CollectionListView.tsx`, temporary `InspectorShell.tsx` drawers and `documentCollection.css`. Shared components accept typed display props and never import business fixtures. The mock-specific editing/received-file simulator is not used in production.
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

The approved **資料収集** screen remains the canonical full-width candidate list: its summary strip, server search/filter/pagination, purpose grouping, row density and necessity editor are retained. Advanced filters and document details open as temporary right drawers, so no permanent column is reserved. Its default quick filter is `必要性 = 未判定`; the operator can intentionally switch to 必要, 不要 or すべて without deleting a candidate.

資料収集 defaults to document browsing: decorative FileText icons replace row
checkboxes, and clicking a row opens the existing inspector. Authorized editors
can enter temporary **一括操作** mode without changing search/filter conditions.
Only that mode exposes checkboxes alongside the file icons in expanded rows,
tri-state group checkboxes, a loaded-document select-all checkbox and the selected
count. Group checkboxes select the loaded representative-purpose document IDs
without expanding the group; select-all includes collapsed groups in the current
loaded view. Entering/exiting bulk mode never changes expansion. Groups manually
opened or closed during bulk mode keep that state on exit; collapsed rows remain
unrendered until the user expands their group. Row click/Enter/Space
toggle selection instead of opening detail; checkbox clicks do not also activate
the row. Existing necessity bulk actions and their confirmation/reason dialog
are reused unchanged. Exit, search/filter changes and leaving the tab/case clear
selection; nothing is persisted. Entry respects the inspector's dirty/saving
guards, and in-flight bulk updates lock selection changes and exit.

The bulk necessity confirmation uses `ModalShell`'s application-level body portal,
not a fixed element inside the workspace. Its single full-viewport backdrop covers
sidebar/header/floating widgets; the original dialog content/validation stay in
place. Shared inert background, focus trapping/restoration and page scroll locks
apply, including busy dismissal guards. Mobile retains 16px viewport padding and
scrolls inside the dialog. `tests/fixtures/bulk-dialog.html` is a dev-only, API-free
manual harness of the production dialog; it does not create or change case data.

The top-level **必要資料** tab reads all pages from the existing collection API and includes only rows where `necessity_status=required`. It filters the same `CaseDocument.id` values in memory. It never duplicates a CaseDocument, creates a ReceivedDocument, or persists a derived workflow state. Only the list/card UI preference may be remembered in localStorage. Changing a candidate to 必要 therefore makes that exact row eligible for 必要資料 on the next read; 不要 and 未判定 stay outside it.

The 必要資料 **リスト** view paginates that complete filtered result in memory
(10 rows by default; 20/50 selectable). Search, acquisition-method and status
filters reset to page 1; a reduced result set clamps the visible page to the last
valid page. The compact 資料一覧 toolbar and footer use the same filtered total
and visible range (`48件中11–20件を表示`, or `0件` for empty results).
Counts and controls are hidden during loading/error states. Card view remains
unpaginated. Paging never clears the open document inspector or changes API
requests, row identities, workflow permissions or persisted data.

The workspace derives display status from the requirement, active `case_task`, received files, generated versions, fulfillment and review state. Assignee/deadline always come from `active_task`; task creation and bulk assignment reuse `CreateCaseTasksDrawer`. Generated files reuse `case_generated_documents` / artifact URLs, and received files reuse `received_documents`. Acquisition labels are mapped from `document_type.handling_type`, capabilities and existing collection source/method metadata; unsupported official forms never show a fake auto-generation action.

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

## Required-document secondary actions

### Case Detail section layout (2026-10-08)

The Case Detail shell is a transparent layout container with a 20px gap
between independent Case Information, Navigation and active-content surfaces.
All seven tab paths reuse the existing `cm-tab-content` wrapper with
`cm-ws-section cm-ws-content-surface`; no tab adds a second main content card.
必要資料 retains its scoped presentation modifier, small folder tile, Japanese
title and subtitle. Decorative English
section labels and their accent lines are omitted; compact top padding leaves
no reserved label space.
Back navigation remains outside the three sections. All surfaces share the
workspace width, 16px radius, semantic theme colors and quiet shared elevation.
The shared content surface uses 20px vertical / 24px horizontal desktop padding,
18px / 20px on narrower workspaces, and 16px on mobile. Existing tab-root and
internal-card layouts, lazy keys, scrolling and drawer portals are unchanged.

Scoped `cm-case-detail` / `cm-ws-required-content` styles retain the existing
header, seven tab handlers, lazy panel keys, search/filter/view state, counters,
six list columns and document drawer interactions. Summary cards use four
desktop columns when space permits, two on tablet and one on narrow layouts.
Container queries account for sidebar width; the navigation rail scrolls
internally and document rows retain their existing compact stacked fallback.
The change adds no API requests, permissions, workflow states or backend edits.
Structural/CSS tests are used without browser automation; no pixel-match or
live responsive verification is claimed without an attached reference image.

The primary required-document view uses a 620px desktop / 550px tablet drawer,
full viewport width on mobile, with a 30px document title and four sticky tabs.
Overview preserves the order Basic Info → Files → Work → Related Task, including
empty states. `RequiredDocumentBasicInfo` shares the two metadata columns across
the regular and C-001 views; they stack on mobile. `RequiredDocumentRelatedTask`
uses the active-task response for assignment/deadline/status and already-loaded
workspace tasks for the real title/avatar when available. There are no added API
fields or fabricated task titles. File rows remain connected to their existing
preview/link/download handlers, and secondary actions keep the nested editor flow.

The required-document inspector keeps its selected document, active tab, scroll
position and loaded versions mounted while an action drawer is open.
`EditSideDrawer` reuses `InspectorShell` for portals, focus trapping and focus
restoration, and the incident-summary editor's `cm-ws-drawer` animation and
`cm-incident-*` header, form-card and footer layout. Secondary editors use the
existing document overlay layers (120/121), a subtle additional backdrop,
540px desktop width, 500px tablet width and full viewport width on mobile.

Necessity, acquisition metadata, collection status and fulfillment edits save
through the existing collection PATCH. Assignee/deadline edits use the existing
case-task PATCH; when no task exists they use the existing batch-create contract
for the selected document. Updated document detail refreshes in place and the
parent list/workspace receives its existing refresh callback. Cancel, X and
Escape close only the action drawer and restore focus to its launching button.
Failed saves preserve the draft and show an error in the action drawer.

Received-document uploads retain the custom picker and existing registration API
inside the same secondary layout. File approval/rejection is now centralized in
the Task drawer; Required Document and C-001 document drawers are read-only for
file review and link to the exact authorized related task. Their large PDF
viewer and file-generation pipeline remain unchanged.
Entrance uses the incident editor's 260ms slide from the right; exit is 210ms,
with reduced-motion support. Only the action body scrolls between header/footer.

## Verification

### Required-document status and Task review boundary (2026-10-08)

`requiredWorkflowPresentation.ts` and `RequiredWorkflowBadge` define the single
Required Document status presentation used by list/card rows, drawer headers,
acquisition status and Related Task cards. The supplied `workflow_state.code`
remains authoritative: selected is indigo, unaccepted/pending review amber,
processing cyan, returned work rose, completed emerald (with a check), and
cancelled slate wherever that state is supplied. The code does not derive task
state from necessity, collection state or file metadata. Overdue uses the API
task flag and stays independent of the workflow badge. Scoped foreground colors
are separate for light/dark themes and tested against the actual surface palette.

Required Document drawers no longer mutate `review_status` or dispatch legacy
C-001 approve/reject actions. The generator editor likewise shows review
navigation rather than a second approval action; saving/generation/version
history and download APIs are retained. Necessity and acquisition metadata
editing remain their existing independent operations.

`タスクを開く` is offered only when the document's published task ID and document
ID match an entry in the already-authorized workspace task response. It switches
the Case Detail tab in place, passes that ID to the existing TasksPanel, locates
its page and opens the existing TaskDetailDrawer. Missing/hidden tasks receive
no actionable link. Transient navigation state is cleared after consumption.
The editor uses the existing Case Detail route state for the same task handoff.

Task review still calls the existing approve/reject endpoints with the exact
latest pending submission ID. UI gates require `task.review`, `allowed_actions`,
pending task/submission state and matching association metadata where supplied.
Missing/inconsistent pending data gets a safe retry state instead of review
buttons. Employees get a read-only waiting message. Rejection still requires a
reason in the existing secondary drawer, retains prior versions, and exposes the
existing rejection note. Server-confirmed updates and workspace reload refresh
Task/history; returning to Required Documents fetches the updated document list,
drawer data and counters without a full page reload.

No backend endpoint, schema, permission mapping, TaskVisibility, Drive storage,
generation or versioning implementation is changed. Existing central Blob/Drive
fallback preview is reused. Frontend tests cover semantic indicators/contrast,
cross-tab task targeting, denied IDs, pending-submission identity and the absence
of document-side review mutations. No browser automation or screenshot scripts
are used; code/structural/contrast tests do not claim live visual acceptance.

Files changed for this status/review-boundary integration:

- `EmployeeManagement/frontend/src/features/document-collection/requiredWorkflowPresentation.ts`
- `EmployeeManagement/frontend/src/features/document-collection/components/RequiredWorkflowBadge.tsx`
- `EmployeeManagement/frontend/src/features/document-collection/components/requiredWorkflowBadge.css`
- `EmployeeManagement/frontend/src/features/document-collection/components/RequiredDocumentsPanel.tsx`
- `EmployeeManagement/frontend/src/features/document-collection/components/RequiredDocumentInspector.tsx`
- `EmployeeManagement/frontend/src/features/document-collection/components/RequiredDocumentBasicInfo.tsx`
- `EmployeeManagement/frontend/src/features/document-collection/components/RequiredDocumentRelatedTask.tsx`
- `EmployeeManagement/frontend/src/features/document-creation/components/C001DocumentReviewDrawer.tsx`
- `EmployeeManagement/frontend/src/features/document-creation/DocumentEditorPage.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/CaseWorkspacePage.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/TasksPanel.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/TaskDetailDrawer.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/taskPresentation.ts`
- `EmployeeManagement/frontend/src/features/case-workspace/types.ts`
- `EmployeeManagement/frontend/src/pages/BusinessQuest.tsx`
- `EmployeeManagement/frontend/tests/requiredWorkflowPresentation.test.mjs`
- `EmployeeManagement/frontend/tests/taskUI.test.mjs`
- `EmployeeManagement/frontend/tests/taskPresentation.test.mjs`
- `EmployeeManagement/frontend/tests/documentCreation.test.mjs`
- This document and `docs/frontend/TASK_WORKSPACE_UI.md`.

### Required-document preview repair (2026-10-08)

`CaseDocumentCollectionDetailResource` now forwards `workflow_state` and
`latest_task_submission` from the existing permission-filtered collection
resource. Previously the ordinary drawer read a missing `workflow_state.code`
and could crash after its backdrop mounted; the C-001 drawer branch did not
make that read. List/detail metadata parity and hidden-submission filtering are
covered by a targeted SQLite regression test.

One `documentPreview.ts` resolver and `DocumentPreviewViewer` shell serve C-001,
generated versions, received files and task-submission preview entry points.
C-001 keeps its saved-PDF backend source; generated PDF versions use the existing
version-specific PDF endpoint. Local received uploads use the authenticated
download endpoint as Blob. Submission-only Drive files have no authenticated
download endpoint in the current API and therefore retain a controlled external
fallback. Share links are never used as PDF iframe sources. Office files retain
external-open/download behavior rather than being treated as PDFs.

The viewer prefers response MIME, uses safe extensions for missing/generic legacy
MIME, validates PDF signatures, and shows loading/error/external fallback states.
Abort guards and Blob URL cleanup cover switching, retry, closing and unmount;
request/frame timeouts prevent indefinite loading. API 401/403 suppress external
fallback. Closing restores focus and scroll lock while the parent drawer/tab
remain mounted. The viewer retains the existing full-screen layout and portal.

Resolver tests run with `node --test tests/documentPreview.test.mjs` using the
installed TypeScript compiler and Node test runner; transports are intercepted
in memory. Local case 49 only has C-001 file data, so this repair does not claim
live end-to-end coverage for other file origins and does not create QA records.

Preview-related files changed across this continuation and the preceding session:

- Frontend collection: `documentPreview.ts`, `api.ts`, `documentCollection.css`,
  `components/DocumentPreviewViewer.tsx`, `components/documentPreviewViewer.css`,
  `components/DocumentVersionList.tsx`, `components/RequiredDocumentInspector.tsx`,
  `components/ReceivedDocumentsList.tsx`.
- Frontend creation: `documentPdf.ts`, `documentDraftStore.ts`,
  `components/C001DocumentReviewDrawer.tsx`, `components/c001DocumentReviewDrawer.css`.
- Frontend workspace: `features/case-workspace/CaseWorkspacePage.tsx` (submission
  preview button and shared viewer only).
- Backend: `app/Http/Resources/CaseDocumentCollectionDetailResource.php`,
  `tests/Feature/CaseDocumentCollectionApiTest.php`.
- Frontend test: `tests/documentPreview.test.mjs`.
- Documentation: this document and `docs/API.md`.

- `node --test tests/*.test.mjs`: **57 passed**. Covers the existing New Case, document collection, theme and mascot suites plus required-only membership, stable CaseDocument identity and independent acquisition/result/review/fulfillment axes.
- Browser suite: `tests/documentCollection.browser.mjs`, seven exported groups, **42 checks**. Uses the supported Browser tab against `tests/fixtures/collection-api.html`, which renders the **production components and configured Axios client** with every transport request intercepted in memory. In addition to initialization/list/inspector/error/recovery/field checks, it verifies required-only rows, no duplicated item identity, read-first detail, real safe received-document links and absence of fake write actions.
- Visual checks on the production-component harness at **1440, 1024, 768 and 390px**, light and dark. The inspector is a dense right column at 1280px and above, a 420px overlay below 1280px, and full-screen on mobile. The 1024px check found and fixed a sidebar-width compression issue; required rows no longer collapse into vertical text. Mobile uses stacked cards without a horizontal form grid.
- This is **not** a claim of authenticated live-DB end-to-end verification: operational local cases remain empty, and this phase deliberately creates none. Production wiring uses the real API client; browser fixtures and request logs live under `tests/` only, excluded from production build entries.
- Targeted ESLint for all changed feature/workspace/test-fixture TS/TSX files passes. Repository-wide lint has three pre-existing errors: `OrganizationDesign.tsx` state update in effect; `tests/fixtures/office-switcher.tsx` and `theme-preview.tsx` Fast Refresh export rule. They are outside this task and left unchanged.
- Production build passes. Main bundle retains the pre-existing >500 kB warning; production collection and shared presentation are lazy chunks. No backend changes, so the backend suite was not rerun.

Run browser groups through the Browser skill's existing tab after opening the dev fixture at desktop width: `initializationChecks`, `listChecks`, `inspectorChecks`, `errorChecks`, `recoveryChecks`, `fieldChecks`, `requiredWorkspaceChecks`. Each resets only in-memory fixture state. Never point fixture operations at the working backend.
