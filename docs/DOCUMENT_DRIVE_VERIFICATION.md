# Generic generated-document Drive verification — 2026-09-06

## Safety and current capability

Verified Laravel runtime: local, mysql, 127.0.0.1, employee_management. Existing local backup: `backups/20260904-1447/employee_management_pre_c001.sql`, 606420 bytes. No credentials changed, no push/deploy or remote database access.

GoogleDriveService vẫn dùng Laravel Http, không dùng Google SDK. Service Account JWT và visa workbook read vẫn được giữ. Local demo dùng auth mode `oauth_user`; OAuth hoàn tất, refresh token được giữ trong private storage và root `THEMIS_TESTING` đúng ID đã xác nhận writable. Không có secret/token trong API response hoặc source.

## Implementation

GeneratedDocumentStorageService uses the existing DocumentPdfRenderer and approved_data + pinned template; no C-001-specific upload or PDF path. Additive migration `2026_09_06_100000_create_generated_document_artifacts_table` was run only on verified local MySQL. New artifacts table stores provider metadata, not PDF binary; local verification found 0 artifacts and the existing 1 generated instance / 1 template intact.

POST `/api/case-files/{caseFile}/document-collection/{caseDocument}/creation/google-drive` requires authenticated case.update, correct case/item and approved instance. Creation state and upload response expose `drive.available` and nullable `drive.artifact` (url, filename, uploaded_at). Metadata is committed only after provider confirmation.

Duplicate protection: PASS in mocked tests. Database locking + unique artifact constraint return prior artifact; tagged Drive lookup reconciles remote success with missing DB metadata. A persistent attempt marker prevents blind retry during ambiguous responses/listing gaps. No automatic file POST retry. Recovery logs contain only instance ID, file ID and recovery key. Requires shared durable cache; losing both marker and DB metadata during a listing gap is not an exactly-once guarantee. Existing remote artifacts are not revalidated or replaced.

Frontend: PDF download unchanged; upload uses backend capability, loading/ref duplicate-click guard and truthful errors. Reload restores saved state. External links require HTTPS drive.google.com and noopener/noreferrer. Real local C-001 upload passed through the authenticated application API; second upload returned the existing artifact. Drive download returned a valid PDF with matching checksum.

## Tests

- OAuth/provisioning/creation/Drive/visa targeted backend: 38 passed, 302 assertions.
- Frontend Drive: 3 passed; TypeScript/Vite build passed (existing large-chunk warning).
- Collection and existing Visa Drive regression passed in targeted batch; initial Windows OpenSSL test-fixture failure was corrected and client tests rerun successfully.
- Full backend run ONCE: 392 passed, 1 failed, 3878 assertions. Existing unrelated LocalV2MigrationPathTest.php:27 expects legacy migration history absent but finds `2026_08_31_120000_remove_legacy_matter_tasks`. Not modified in this task; full suite is NOT green.
- Frontend generation/PDF/Drive: 12 passed; targeted ESLint passed; TypeScript/Vite build passed (existing large-chunk warning).
- Targeted Laravel Pint passed after import formatting. Git diff whitespace check passed.
- All automated Google calls mocked; no automated real Drive uploads.

## Files changed in this task

Backend paths relative to EmployeeManagement/backend:

- .env.example; config/services.php; routes/api.php
- app/Services/GoogleDriveService.php
- app/Services/GeneratedDocumentStorageService.php (new)
- app/Exceptions/GeneratedDocumentDriveException.php (new)
- app/Models/CaseGeneratedDocument.php
- app/Models/GeneratedDocumentArtifact.php (new)
- app/Http/Controllers/Api/CaseDocumentCreationController.php
- database/migrations/2026_09_06_100000_create_generated_document_artifacts_table.php (new)
- tests/Feature/CaseDocumentCreationApiTest.php
- tests/Feature/GoogleDriveGeneratedStorageTest.php (new)

Frontend: src/features/document-creation/documentDraftStore.ts, DocumentEditorPage.tsx, new components/DocumentDriveButton.tsx; tests/documentPdf.test.mjs and new tests/documentDrive.test.mjs.

Documentation: API.md, DATA_MODEL.md, ARCHITECTURE.md and this report. Other pre-existing working-tree changes preserved.

## Local OAuth verification

OAuth user authorization and token refresh are configured only for local development. Real verification reused `THEMIS_TESTING/Client`, created one `CL-33_DRIVE DEMO TEST/CASE-43_DRIVE DEMO CASE/作成書類` hierarchy, and repeated Client/Case provisioning without additional mappings. Existing approved C-001 (generated document 1, case 33, document 349) uploaded once; the second API request returned the existing artifact. Drive lookup found one tagged file, download returned HTTP 200 with a valid PDF signature and matching SHA-256 checksum. MySQL contains one artifact with uploader and upload time populated.

Service Account remains the future company/Shared Drive mode. Use durable shared cache for upload recovery markers; do not clear markers or change APP_KEY/destination during unresolved uploads.

Reference: [Google Shared Drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives), [file uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

Not implemented: official C-001 legal contract body; replacement/versioning of uploaded artifacts. No additional features, push or deploy.
