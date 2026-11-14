# Case Detail Task UI

Implemented 2026-10-08 against the approved Task mockup. This changes only the
Task list, detail drawer, and presentation of the existing workflow actions.
The Case Detail header, sidebar, main navigation, Required Documents UI,
database, Laravel workflow, TaskVisibility, and Google Drive integration remain
unchanged by this redesign.

## List and data

`TasksPanel` is extracted from the active `CaseWorkspacePage`, replacing the
oversized task cards and inline editing fields. It renders a compact table with
document identity, task title, status, assignee, deadline, updated timestamp and
detail action. A row or its keyboard-accessible title opens the selected task.
The list has no selection checkboxes or bulk-selection controls. The
selected/open row uses the existing indigo theme accent independently of any
bulk selection, and its highlight is retained while the detail drawer is open.

Search covers title, document name and document code, with NFKC normalization.
Status counts and optional management assignee filtering use only the tasks
already returned by the authorized workspace API. The overdue filter consumes
the backend `is_overdue` flag, independently of primary status. Updated/deadline
sorting keeps missing timestamps last. Pagination supports 10, 20 and 50 records;
changing search/filter/sort/page size resets the page, and deletion/filtering
clamps stale page numbers. Cancelled tasks remain visible under All.

Workspace responses are scoped to case/user identity. A changed identity gates
the old data immediately, remounts task interaction state, refreshes the existing
workspace API and ignores late responses from the prior scope. Task actions
apply server-returned task data and refresh the workspace, including related
required-document state and history. No task visibility filtering is added to
React; backend authorization remains authoritative.

## Drawer and actions

### Required-document task creation duplicate guard

The normal `タスクを追加` wizard uses `has_existing_task` from task options plus
the existing task relation, not only active statuses. Active, completed, cancelled
and soft-deleted task records lock the document. Visible existing task metadata
shows the real assignee, deadline and shared status badge; private task details
stay hidden while the existence flag still prevents duplicate selection.
Select-all, initial selections, Step 2/3 and the POST payload include only eligible
documents. A 409 `case_document_task_exists` reloads options, removes newly locked
selections and returns to Step 1 without retrying the POST. Reopening the wizard
always fetches current options; no browser hard refresh is required. The backend
checks current records under the existing case/document transaction locks. No
schema migration or follow-up task UI is introduced.

`tests/taskCreation.test.mjs` executes the actual wizard handlers with an in-memory
API; `CaseTaskWorkflowTest` tests direct/stale/terminal/private duplicates and
atomic rollback in SQLite memory. SQLite cannot exercise native `FOR UPDATE`
concurrency, so simultaneous production-engine locking is not claimed as a load test.

`TaskDetailDrawer` uses the existing `InspectorShell`, `useDrawerDismiss` and
`EditSideDrawer`. It is a 500px right-edge, full-height panel on desktop and
full-width on mobile. Entrance/exit durations are 260/210ms, with reduced-motion
support. Tabs are Task Details, Files and History. Basic information uses actual
task/document identity, description, state, assignee, deadline, created and
updated timestamps; missing metadata displays a dash.

Employees see acceptance and submission actions only when `allowed_actions`
permits them. Automatic generation is offered for the existing official C-001
workflow when submission is allowed. Pending-review employees see a waiting
message; returned work includes the real rejection note. Management edit,
deadline, cancellation and review actions require both current capability and
the backend flags. Assignee/deadline edits, approval confirmation, cancellation
confirmation and rejection reason entry use a secondary right drawer. Rejection
requires a nonblank reason and uses the existing 5,000-character API limit.

The existing `caseWorkspaceApi` methods remain the sole task API layer. Review
actions operate on the latest current pending submission, not an arbitrary
historical preview version. Assignment options come from `taskOptions`. A
reassignment that makes a task invisible removes it via the server response;
cancel keeps the server's existing lifecycle and version history.

File approval/rejection is provided only by this Task workflow. Required Document
and generator views display results and hand off to this drawer instead of
dispatching separate approval actions. An authorized related-task handoff passes
the exact task ID, opens its actual page in the list and preserves the Case Detail
route. An ID absent from the authorized response cannot open the drawer. Review
also checks pending task/submission state and association IDs when present; an
inconsistent response displays a retry state, not active review buttons.

Files use actual submissions and immutable version numbers. Previews reuse
`resolveSubmissionPreviewTarget` and `DocumentPreviewViewer`. Raw Drive links
never enter a PDF iframe. Closing preview keeps the Task drawer and its tab
mounted. History filters the already-authorized activity feed by real
`task_id`/`case_task_id`; it does not fabricate events or borrow another task's
history for the same document.

### Manual upload request correction

`caseWorkspaceApi.submitTask` sends a real browser `File` as multipart field
`file`, with the original filename, to the existing POST task-submission route.
Its per-request Content-Type is cleared with `null`: this suppresses the shared
JSON default and Axios's POST urlencoded fallback while allowing the transport
to generate the multipart boundary. Authentication and all other JSON actions
are unchanged. With the former JSON default, Axios transformed FormData into
`{"file":{}}`, so Laravel correctly rejected the missing UploadedFile.

The existing picker still submits the chosen file immediately. The Task drawer
retains the File object on failure, shows contextual Japanese upload errors and
a retry action, shows `アップロード中…`, and prevents duplicate requests. Missing
files fail before HTTP. Upload errors no longer enter the global workspace/task
fetch error banners; an actual subsequent workspace refresh failure still does.
Success applies the existing server task/submission response and workspace
refresh so Task and Required Document read the same immutable submission.

The backend contract remains `required|file|max:20480` (KiB), with no MIME
whitelist. No extra type restriction, size policy or removed validation is
introduced by this fix. Automatic C-001 generation keeps its separate existing
generator route and does not ask for a local file.

## Styling and verification

### Task handling presentation (2026-10-09)

The Task drawer labels its existing action area `対応` rather than `作業`.
Only an `unaccepted` task with `can_accept` displays `対応を開始`; it still
calls the existing acceptance handler/API. Other states show the real task
status, assignee and `accepted_at` when present. The helper explains the status
transition and audit history, not a team notification: acceptance currently
records an activity but does not dispatch notifications. Existing submission,
generation, assignment, deadline, review and cancellation actions are retained.
File rows reuse `DocumentFileCard` for file-type icons, compact version pills,
uploader/date and review status; preview resolution is unchanged.

`tests/fixtures/task-drawer.html` provides a development-only state demo. Action
callbacks run entirely in memory; it does not accept or modify real tasks.

`taskUI.css` scopes the design to Task components and reuses THEMIS surface,
text, border and status tokens. Shared Button, IconButton, SearchInput,
StatusBadge and UserAvatar are retained. Pending review uses the allowed amber
semantic treatment; the mockup's illustrative violet/glow is restrained to the
existing workflow accent. Tablet reduces optional columns; narrow containers
transform the same table into compact task cards without editing forms.

Code checks cover the 1440/1024/768/390 breakpoints and light/dark token wiring.
No browser automation or screenshot scripts are used, so neither pixel
similarity nor live visual acceptance is claimed. The header stays unchanged;
file size is omitted because the current API does not provide it, and missing
dates/descriptions are not invented to match the mockup.

Tests:

- `tests/taskPresentation.test.mjs`: authorized-data counts, search, status and
  assignee filters, overdue independence, sorting, pagination, history and
  supported generation conditions.
- `tests/taskUI.test.mjs`: server-rendered markup checks for read-only task rows,
  employee/management action boundaries, actual file identities and completed
  states. Portal contents are server-rendered only for structural checks; this
  does not emulate browser layout, focus, animations or clicks.
- Existing document-preview, document-collection and auth-navigation tests are
  run as regressions. TypeScript, targeted ESLint, production Vite build and
  `git diff --check` are required.
- `tests/taskUpload.test.mjs` uses the actual installed Axios fetch adapter and
  an in-memory fetch interception to reproduce JSON file loss and verify binary
  multipart, boundary, field name, filename, authentication, no-file rejection
  and retry. Targeted `CaseTaskWorkflowTest` cases use SQLite memory storage and
  mock Drive to verify required/size validation, assignee enforcement, PDF bytes
  reaching the service, shared Task/Required Document identity and immutable
  resubmission. No real case/file data is mutated.

Files for this redesign:

- `EmployeeManagement/frontend/src/features/case-workspace/CaseWorkspacePage.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/TasksPanel.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/TaskDetailDrawer.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/TaskStatusBadge.tsx`
- `EmployeeManagement/frontend/src/features/case-workspace/taskPresentation.ts`
- `EmployeeManagement/frontend/src/features/case-workspace/taskUI.css`
- `EmployeeManagement/frontend/src/features/case-workspace/taskUpload.ts`
- `EmployeeManagement/frontend/src/features/case-workspace/api.ts`
- `EmployeeManagement/frontend/src/features/case-workspace/types.ts`
- `EmployeeManagement/frontend/src/features/document-collection/components/EditSideDrawer.tsx`
  (optional scope class props; existing document drawers keep their defaults)
- `EmployeeManagement/frontend/tests/taskPresentation.test.mjs`
- `EmployeeManagement/frontend/tests/taskUI.test.mjs`
- `EmployeeManagement/frontend/tests/taskUpload.test.mjs`
- `EmployeeManagement/backend/tests/Feature/CaseTaskWorkflowTest.php`
- This document.
