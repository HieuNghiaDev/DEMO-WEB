# Unified case history (2026-10-09)

`CaseWorkspacePage` delegates only the 履歴 tab to `CaseHistoryPanel`. The case
header, seven tabs, sidebar and other content areas are unchanged.

## Domains and storage

- System operations use the existing `CaseWorkspaceAuditService` / `case_activities`.
  New operations carry server-owned `metadata.history_kind=system`, actor user ID
  and label. There is no API/UI for editing, deleting or manually creating audit.
- Communications also use `case_activities`: title/content/occurred_at hold
  subject/summary/start; `metadata.communication` holds the validated type,
  direction, start/end/duration, counterparties, participants, details, outcome,
  next action and deadline. Creator/updater user references are server-owned.
  Employee/client/party selections use real IDs plus a server-resolved name
  snapshot; only unregistered external people use text fallback.
- No migration, table, reminder system or backfill. Existing `case_meeting_logs`
  remain stored and appear read-only in this new timeline. Their existing writer
  now enforces case permissions and emits audit on create/edit.
- Untagged historical manual/internal notes remain read-only legacy business
  records, not asserted to be verified audit. Historical operations with existing
  event/entity audit metadata map to 操作履歴. Unmarked historical entries are
  preserved, not rewritten or given fabricated provenance.

## Timeline and forms

Backend UNION pagination combines visible activity operations, communication
records and legacy meeting records, descending by occurrence datetime with stable
ID/source tie breaks. Default 15, maximum 50 entries per request. Workspace's
embedded recent activities are capped at 50; full history uses the new endpoint.

すべて / 操作履歴 / 連絡・面談履歴, communication type, actor, date bounds and
search run server-side. Search is escaped LIKE on title/content, not full-text
search, not arbitrary nested metadata search. Filters apply before pagination.
The API returns `counts.all/system/communication` after the authorized type,
actor, date and search filters, independent of the active kind tab/page. Page
metadata includes current_page/per_page/last_page/total/from/to. Out-of-range
pages clamp to the last available page (or page 1 for an empty result).
The footer displays a range, bounded numbered pages and 15/30/50 page sizes.
Filter and page-size changes reset to page 1; page changes preserve filters.
Only results show loading, keeping the header and controls mounted.
Date grouping and display use the browser's timezone; storage/filter dates use
the backend application timezone (normally Asia/Tokyo).

The approved history content uses segmented kind pills, a compact desktop filter
row (type, actor, date range, search) and a centered pagination footer. Filters
wrap by available content width; dates retain native labelled inputs.
Compact shared-token rows show time, timeline rail/dot, semantic icon tile,
title/target/change and the shared `UserAvatar` initials beside the recorded actor;
day headings count visible page entries, without repeating dates or 操作履歴 in
each row. Communication rows distinguish type/direction and optional duration,
counterparties, participant count and next-action deadline. Optional category
labels are presentation-only and never reclassify the server-owned history kind.
Full details use an
accessible disclosure button, including structured before/after (no raw JSON dump). Assignee IDs in
change detail resolve to employee names when available. Missing legacy values
remain absent. Creation/edit open a right-side drawer using `ModalShell` for
focus trapping, scroll locking and the body portal. The form body scrolls below
the fixed header and above the save controls. Header links jump to the form
sections. Counterparty and participant fields show the current selection and open
a searchable list. The drawer fills narrow screens.

Eight communication types: phone, email, chat, online_meeting, office_meeting,
visit, postal_mail, other. Direction applies to phone/email/chat/postal_mail.
Duration is calculated server-side from timestamps for timed interactions;
email/chat/postal duration is null. End before start is rejected. Save failures
retain input and display an error. Single-flight refs prevent duplicate submits.

The same form accepts optional attachments for all eight types. Select files
before saving and download saved files from the entry details. The limits per
file are 20 MiB for images/PDF, 100 MiB for audio and 250 MiB for video, with a
combined 300 MiB per save. The browser stages files in 4 MiB chunks and shows
transfer progress followed by the Drive save state. Staging requests have a
separate 180-request-per-minute budget per user. The final save uses the
standard API limit. Normal case
provisioning creates `写真・連絡面談記録` alongside `作成書類`; an existing
normal case provisions the history folder on first upload. Folder identity uses
`external_storage_locations`. Uploads to publicly shared history folders are
rejected. The Drive hierarchy inherits its configured access, so confidential
cases cannot upload to this destination. File bytes live on Drive and downloads
are authorized against the parent case and communication. History writes and
audit publish only after all requested uploads succeed.

Communication create/edit and audit share a transaction. No-op edit emits no new
audit. Related task creation occurs only after a separate explicit user action,
using shared existing standalone CaseTask creation (not required-document batch
creation). Title/deadline are prefilled; an active assignee is required.
Case/activity locks and stored `communication.linked_task_id` prevent repeat
creation even after task completion/cancellation. The link is displayed only if
the existing task visibility scope permits it. No automatic task is created on
communication save. Standalone tasks retain existing task capabilities; this
feature does not add a document file/submission workflow to standalone tasks.

Case creation, case-information edits and assignee changes now also emit existing
workspace audit events (`case.created`, `case.updated`) in the mutation transaction.
Deadline edits preserve before/after. No historic case events are invented.

## Authorization and compatibility

History/options require `case.view`. Communication writes require both
`case.view` and `case.update`; next-action task creation additionally requires
`task.manage`. No role-name inference in the UI. Case record IDs are checked
against the route case before show/edit/task mutation. Existing task/audit
privacy scope is retained before pagination. No new office/case ownership ACL is
invented: the project currently grants case access through existing RBAC.

Legacy `/activities` writes are restricted to communication and reject supplied
metadata. The old generic operation/event/note creation UI is removed. Existing
stored activities remain intact. Old meeting-log consumers retain their response
shape and endpoint; writes now require case.update and server-own the creator.

## Verification

- `backend/tests/Feature/CaseHistoryTest.php`: CRUD/audit, 8 types, duration,
  references, permissions, forged operations, IDOR, 15/30/50 server pagination,
  complete stable equal-timestamp pages, filtered counts, page clamping, legacy
  preservation, explicit task creation, duplicate guard, task privacy, no-op,
  transactional audit failure, legacy writer.
- `frontend/tests/caseHistory.test.mjs`: real component handlers and markup,
  capability-only actions, structured detail, no immediate write, single-flight,
  retained form/error, explicit task creation, server page parameters, filter/page
  state, range, numbered pages, bounds, day grouping and collapsed details;
  approved rail/icon/avatar structure and non-authoritative category labels.
- Dev-only `tests/fixtures/case-history.html`: uses actual UI with memory-only API
  overrides. Responsive iframe viewport controls allow measured 1440/1024/768/390
  widths independently of browser-window sizing. No real data is written.
- Native MySQL simultaneous requests are not load-tested; transaction locks are
  implemented and sequential stale/repeated requests are covered by API tests.
