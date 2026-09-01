# 案件管理 — simplified 新規案件

`+ 新規案件` opens one compact popup over `/quests`. It is not a wizard and `/quests/new` redirects to the list, preventing a second creation interface.

## Visible intake fields

Only these fields appear in the default form:

- 依頼者: 氏名 / 組織名, manual フリガナ, 個人 / 組織 segmented selector.
- 事件類型: actual catalog-backed canonical `労災` and `交通事故` buttons. There is no subtype picker.
- 担当者: a clickable picker that searches real active employees and keeps the existing level-4/5 plus `employee.view` restriction.
- 案件メモ: optional three-line case-specific note.
- Collapsed `依頼者情報を追加`: phone, email and address only.

Existing-client suggestions use the existing catalog. Selecting one keeps a compact selected row and never creates a client. Kana is always manual and never overwritten.

The popup intentionally does **not** show or collect 案件状態, 優先度, 部署, 開始日, 目標完了日, 案件番号, 案件名, 依頼者備考, advanced case settings, document data or a subtype.

## Creation defaults and review

The backend already defaults `case_files.status` to `intake`, `priority` to `normal`, and timestamps including `created_at` are server/database-owned. The quick-create payload does not send status, priority, department or date values. `title` is generated internally as `{client name} / {case type}`.

`入力内容を確認` validates locally and opens `登録内容の確認`; it makes zero API mutations. The review renders only client identity/contact, case type, assignee and case note.

`修正する` preserves the same draft. Only `この内容で案件を作成` mutates:

- Existing client: POST `/case-files`.
- New client: POST `/clients`, then POST `/case-files`.

If client creation succeeds but case creation fails, the returned client remains selected; retry sends only the case POST. A submit lock prevents duplicate creation.

Case creation makes zero CaseDocuments and never calls templates, candidate preview or initialization. After success the app opens `/quests/{id}`; document collection remains the existing explicit preview → confirm → initialize workflow.

## Implementation and verification

- `src/features/case-management/NewCaseDialog.tsx`: simplified popup, picker, final review and guarded API flow.
- `src/features/case-management/caseManagement.css`: compact 740px desktop dialog, light/dark tokens and mobile full-screen behavior.
- `tests/caseManagement.browser.mjs`: checks removed fields, selectors, collapsed contact section, review boundary, one-time creation and no document writes.

The form targets normal desktop height without body scrolling while contact details are closed. At narrow mobile widths it becomes full-screen without horizontal overflow. Backend, database, document collection and deployment are not changed.
