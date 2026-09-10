# Generic PDF generation — local verification

Date: 2026-09-05

## PDF LIBRARY

mPDF v8.2.7, added through Composer with its required dependencies only (no existing package version updates). PHP gd/mbstring are available locally. Sun-ExtA is supplied by the dependency and embedded/subset in the PDF; no proprietary/system font was copied into source control. Composer lock pins installed versions.

## GENERIC SERVICES / RENDERER

- `DocumentPdfRenderer`: approved-state guard, pinned template, renderer selection, A4 mPDF bytes and safe filename.
- `GenericLegalDocumentRenderer`: current `generic_legal_document` implementation. Reads pinned template_body and approved_data, never live Client/CaseFile or latest active template.
- Supports text placeholders `{{ field_key }}` and existing `<section data-template-fields>` marker. Undefined placeholders fail closed. DOM parsing uses LIBXML_NONET, retains only explicit structural tags, strips all attributes, and drops scripts/styles/resources/PDF directives. Values are escaped; no Blade, eval or recursive placeholder execution.
- Template metadata still supplies document title/code through the pinned template's document type relation, consistent with the editor. Direct changes to that master or future renderer/font updates can change historical appearance; pixel-identical archival rendering is not claimed. No unnecessary schema change was made.

## API ENDPOINT

`GET /api/case-files/{case}/document-collection/{document}/creation/pdf`

Sanctum + case.view; wrong case/item or missing instance returns 404; draft/review returns 422. An approved snapshot is required. Response is application/pdf with attachment Content-Disposition, ASCII fallback and UTF-8 filename. Filename uses code/title, stable case ID and approved client name, sanitizing path/control/header characters. Existing CORS already exposes Content-Disposition.

## C-001 DOWNLOAD

WORKING at API/service level. Authenticated route tests produce actual PDF bytes, not mock PDF content. Real local instance 1 (case 33, item 349) rendered successfully to a temporary QA file, 30,524 bytes. Application generates bytes on demand; it does not store PDF binaries in the database or permanently save PDFs. Only private font metrics/cache under storage/framework/cache/document-pdf are used by mPDF.

## JAPANESE RENDERING

VERIFIED. Rendered the actual PDF to PNG and visually inspected the full page: Japanese title, labels, address and notes are readable with no tofu/clipping. pypdf independently confirmed one 210 × 297 mm page, Japanese text extraction and embedded `/MPDFAA+Sun-ExtA` FontFile2.

## PINNED TEMPLATE / APPROVED SNAPSHOT

VERIFIED. Automated tests approve v1, deactivate it, create unsupported active v2 and still download v1 successfully. Client and CaseFile changes do not appear in rendered HTML; approved data is used. PDF GET does not update the generated record. Existing immutability/authorization regression tests continue to pass.

## FRONTEND DOWNLOAD

Implemented and unit-tested: approved view only, shared authenticated Axios, Blob/MIME/PDF-signature check, backend UTF-8 filename, anchor download, object-URL cleanup, busy state, synchronous duplicate-click guard, visible error and retry. Google Drive remains disabled. No frontend PDF rendering.

Real in-app browser check: button clicked, no UI error/console error, but the browser tool timed out waiting for a download event and no matching file was found in the normal Downloads directory. End-to-end browser file delivery is therefore NOT VERIFIED; operator confirmation was requested. Do not interpret API/unit success as proof that the integrated browser saved a file.

## TEST RESULTS

- Document generation/PDF: 17 PASS, 153 assertions.
- Collection API/fields/initialization regression: 136 PASS, 2003 assertions.
- Full backend, run once at the end: 383 PASS, 1 FAIL, 3812 assertions. Known unrelated LocalV2MigrationPathTest failure regarding remove_legacy_matter_tasks remains unchanged.
- Frontend: 5 PDF tests PASS; 4 generation tests PASS; 20 collection tests PASS. Initial filename sanitizer test expectation was corrected (four underscores, not three), then the PDF tests passed.
- TypeScript/Vite build PASS; targeted ESLint PASS; targeted Pint PASS.
- Existing >500 kB frontend chunk warning remains.
- Composer audit: 4 advisories affecting existing league/commonmark (not introduced/updated by this task). No unrelated dependency/security fixes attempted. Existing Composer ambiguous class-resolution warnings also remain.

## FILES CHANGED

- EmployeeManagement/backend/composer.json
- EmployeeManagement/backend/composer.lock
- EmployeeManagement/backend/app/Services/DocumentPdfRenderer.php
- EmployeeManagement/backend/app/Services/GenericLegalDocumentRenderer.php
- EmployeeManagement/backend/app/Http/Controllers/Api/CaseDocumentCreationController.php
- EmployeeManagement/backend/routes/api.php
- EmployeeManagement/backend/tests/Feature/CaseDocumentCreationApiTest.php
- EmployeeManagement/frontend/src/features/document-creation/documentPdf.ts
- EmployeeManagement/frontend/src/features/document-creation/components/DocumentPdfDownloadButton.tsx
- EmployeeManagement/frontend/src/features/document-creation/DocumentEditorPage.tsx
- EmployeeManagement/frontend/tests/documentPdf.test.mjs
- docs/API.md
- docs/ARCHITECTURE.md
- docs/DOCUMENT_PDF_VERIFICATION.md

Temporary QA script/PDF/PNG live in ignored tmp/pdfs, not production source.

## DATABASE CHANGES

NONE. Before/after runtime checks: local mysql employee_management at 127.0.0.1; one generated instance, approved, and one generation template. Backup from 2026-09-04 exists at backups/20260904-1447/employee_management_pre_c001.sql (606,420 bytes). No migrations, seeders, data cleanup, PostgreSQL changes, Railway, production, push or deploy.

## NOT IMPLEMENTED

- Official C-001 legal body; PDF explicitly notes that formal contract text is not included.
- Google Drive upload.
