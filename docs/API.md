# Tài liệu REST API

Base URL mặc định: `http://localhost:8000/api`. Nội dung request/response là JSON, trừ endpoint tải Excel. Các endpoint có biểu tượng khóa yêu cầu header:

```http
Authorization: Bearer <sanctum-token>
Accept: application/json
```

## Xác thực

| Method & path | Khóa | Nội dung request | Kết quả |
| --- | --- | --- | --- |
| `POST /login` | Không | `email` (email), `password`, `remember` (boolean, tùy chọn) | Trả `user` và token mới. Rate limit 5 request/phút. |
| `GET /me` | Có | — | Trả user hiện tại cùng `employee.office` và `employee.department`. |
| `PUT /password` | Có | `current_password`, `password`, `password_confirmation` | Đổi mật khẩu, bỏ cờ bắt buộc đổi và thu hồi toàn bộ token. Rate limit 5 request/phút. |
| `POST /logout` | Có | — | Xóa token hiện tại và trả thông báo. |

Token không ghi nhớ hết hạn sau 12 giờ; token có `remember: true` hết hạn sau 30 ngày. Frontend lưu token vào `sessionStorage` hoặc `localStorage` tương ứng.

Tài khoản có `must_change_password=true` chỉ được gọi `/me`, `/password` và `/logout`. Mọi API nghiệp vụ khác trả `403` với `code: password_change_required`. Mật khẩu mới phải có ít nhất 11 ký tự, gồm tối thiểu một chữ hoa và một ký hiệu. Sau khi đổi thành công, người dùng phải đăng nhập lại vì tất cả token cũ đã bị thu hồi.

## Hồ sơ khách hàng và案件

Form案件 một trang dùng `GET /clients` để tìm theo tên/kana/điện thoại/email phía frontend. Modal **登録して選択** gọi API hiện có `POST /clients` (quyền `case.create`), nhận HTTP 201 `{client}` rồi tự chọn `client.id`. Tên là bắt buộc; kana, phone, email, client_type, nationality, address, notes dùng các trường backend đã hỗ trợ, không có trường language. Khách hàng được lưu riêng, nên hủy form案件 sau đó không xóa khách hàng vừa đăng ký. Khi tạo案件, frontend gửi `client_id` và tự ghép `title` từ tên khách hàng + subtype/parent trong giới hạn 255 ký tự; không thay đổi hợp đồng backend. Xem [CASE_MANAGEMENT_UI.md](frontend/CASE_MANAGEMENT_UI.md).

Khách hàng (`clients`) lưu dữ liệu liên hệ: `phone`, `email`, `address`, `nationality`, cùng `name`, `name_kana` và `client_type` (`individual`/`corporate`). Khi tạo mới `case-files`, payload `client` có thể bao gồm các trường này; email hợp lệ, điện thoại tối đa 30 ký tự, địa chỉ tối đa 255 ký tự. `GET /case-files/{id}` trả toàn bộ thông tin liên hệ của khách hàng để hiển thị trong hồ sơ; `PUT /clients/{client}` cập nhật hồ sơ khi người gọi có `case.update`.

Mỗi hồ sơ có thể có tab tự do ngoài ba tab mặc định. `POST /case-files/{caseFile}/custom-sections` tạo tab với `title` (bắt buộc, tối đa 80 ký tự) và `content` (tùy chọn). `PATCH` hoặc `DELETE /case-files/{caseFile}/custom-sections/{customSection}` cập nhật hoặc xóa tab; các thao tác này yêu cầu quyền `case.update`.

`GET /case-files` trả tiến độ tài liệu cho danh sách: `documents_count` chỉ đếm `case_documents` có `necessity_status=required`. `confirmed_documents_count` chỉ đếm các tài liệu cần thiết có `review_status=reviewed` và `fulfillment_status` là `satisfied` hoặc `satisfied_by_alternative`. Vì vậy hồ sơ mới hoặc chỉ có tài liệu `undetermined`/`not_required` hiển thị `0 / 0`; việc chỉ nhận file chưa tự được coi là hoàn thành.

### Workspace hồ sơ và checklist

`POST /case-files` giữ nguyên request/response shape và quyền, nhưng CaseFile mới bắt đầu với **0 `case_documents`** (`documents_count = 0`, `confirmed_documents_count = 0`), kể cả khi case type có template legacy đang hiệu lực. Không gọi legacy template engine hoặc V2 generator và không ghi activity initialize trong lúc tạo案件. Hồ sơ/tài liệu đã tồn tại không bị thay đổi.

Vòng đời V2: tạo案件 → GET `document-collection/initialization-preview` → người dùng xác nhận → POST `document-collection/initialize` → `CaseDocumentChecklistGenerator::generateForCase`. Preview chỉ đọc; initialize tạo candidate còn thiếu và ghi activity khi thực sự tạo item; chạy lại không tạo trùng. Template legacy còn giữ dưới dạng deprecated/compatibility-only, chỉ qua API tường minh bên dưới. Xem [PHASE_1D_CHECKLIST_GENERATOR.md](PHASE_1D_CHECKLIST_GENERATOR.md) về transaction, inheritance và snapshot.

| Method & path | Quyền | Hành vi |
| --- | --- | --- |
| `GET /case-files/{id}/workspace` | `case.view` | Trả hồ sơ, checklist, bên liên quan, deadline, task, timeline và summary tiến độ. |
| `POST /case-files/{id}/apply-document-template` | `document.create` | Compatibility-only: áp dụng template legacy tường minh; chạy lại không tạo trùng checklist. Không tự chạy khi tạo案件. |
| `POST/PATCH/DELETE /case-files/{id}/parties/...` | `case.update` | Quản lý gia đình, công ty, đối phương, bảo hiểm, bệnh viện và bên liên quan khác. |
| `POST/PATCH/DELETE /case-files/{id}/deadlines/...` | `case.update` | Quản lý hạn lưu trú, nộp hồ sơ, bổ sung, thời hiệu và hạn nội bộ. |
| `POST/PATCH/DELETE /case-files/{id}/case-tasks/...` | `case.update` | Quản lý task gắn trực tiếp với hồ sơ. |
| `POST /case-files/{id}/activities` | `case.update` | Ghi lịch sử liên lạc, sự kiện, nộp hồ sơ, y tế, tai nạn hoặc ghi chú nội bộ. |

Tài liệu hỗ trợ `requirement_level`: `required`, `conditional`, `optional`; và trạng thái nghiệp vụ: `not_requested`, `requested`, `waiting`, `received`, `reviewing`, `deficient`, `resubmission_requested`, `confirmed`, `submitted`, `not_required`. Tài liệu thêm thủ công không phụ thuộc template. Xóa tài liệu dùng soft delete để phục hồi/audit về sau.

### V2 資料収集 — Phase 1E-A

Frontend consumer từ Phase 1E-C: tab 資料収集 trong CaseWorkspace gọi các endpoint 1E-A/1E-B hiện có, không thay contract. Xem [production integration](frontend/DOCUMENT_COLLECTION_INTEGRATION.md); các ghi chú “chưa nối frontend” bên dưới mô tả thời điểm triển khai backend tương ứng.

API này độc lập với các route `documents` legacy và **không khởi tạo checklist**. Không gọi generator khi GET/PATCH, tạo CaseFile hoặc đăng ký tệp. Không gửi yêu cầu bên ngoài, OCR hoặc quyết định pháp lý bằng AI.

| Method & path | Quyền | Response |
| --- | --- | --- |
| `GET /case-files/{caseFile}/document-collection` | `case.view` | `{ documents: [...], pagination: {...}, summary: {...} }` |
| `GET /case-files/{caseFile}/document-collection/{caseDocument}` | `case.view` | `{ document: {...} }` chi tiết |
| `PATCH /case-files/{caseFile}/document-collection/{caseDocument}` | `case.update` | `{ document: {...} }` chi tiết sau cập nhật |
| `POST /case-files/{caseFile}/document-collection/{caseDocument}/received-documents` | `case.update` | Đăng ký một tệp upload riêng tư, Google Drive hoặc URL HTTPS/HTTP và gắn vào mục tài liệu; trả `{ document: {...} }` HTTP 201 |
| `GET /case-files/{caseFile}/document-collection/{caseDocument}/received-documents/{receivedDocument}/download` | `case.view` | Tải tệp upload riêng tư khi tệp, mục và hồ sơ cùng thuộc một CaseFile; link ngoài vẫn mở ở URL gốc |

Giữ nguyên Sanctum, middleware bắt đổi mật khẩu, rate limit và RBAC workspace. Role chính thức level 1/2 đọc; level 3 trở lên có `case.update`. **Không thêm ACL hồ sơ riêng**: hiện CaseWorkspace cấp quyền theo RBAC dùng chung, không giới hạn người được phân công từng hồ sơ. PATCH người phụ trách mục thu thập không thay người phụ trách CaseFile (route assign CaseFile vẫn giữ quy tắc level 4/5). Detail/PATCH kiểm tra item thuộc đúng case trước validation hoặc trả dữ liệu; sai case, case/item đã soft-delete hoặc không tồn tại trả 404. Không thay đổi permission seeder hay middleware.

#### Query parameters

Các filter kết hợp AND; chỉ áp dụng cho các CaseDocument chưa soft-delete của hồ sơ trong URL. Không group theo document_type: hai mục D-003 theo bệnh viện/đối tượng/kỳ khác nhau vẫn là hai hàng theo `CaseDocument.id`.

| Parameter | Hành vi |
| --- | --- |
| `search` | Tối đa 255 ký tự, tìm substring code/tên Nhật của document type và title của item thủ công; LOWER, escape `%`/`_` để tìm literal |
| `purpose` | Mã purpose, ví dụ `W3`; lọc qua EXISTS của pivot, không nhân đôi hàng nhiều purpose |
| `source` | So khớp toàn bộ `case_documents.collection_source`, tối đa 255; không lấy `standard_source` từ master |
| `assignee_id` | ID integer dương của nhân viên được phân công; ID không khớp trả danh sách rỗng |
| `necessity_status` | undetermined / required / not_required |
| `collection_status` | not_started / preparing / requested / partially_received / received / difficult / closed |
| `collection_result` | Mã ngoại lệ bên dưới; query rỗng được Laravel chuẩn hóa null để tìm item chưa có kết quả |
| `fulfillment_status` | undetermined / insufficient / satisfied / satisfied_by_alternative |
| `review_status` | unreviewed / reviewing / reviewed / returned |
| `overdue` | true/false/1/0; quá hạn = response_deadline < now() theo timezone ứng dụng và collection_status không là received/closed |
| `preservation_priority` | true/false/1/0; cờ bảo toàn độc lập với độ ưu tiên công việc |
| `priority` | low / normal / high / critical, lọc collection_priority |
| `deadline_from`, `deadline_to` | YYYY-MM-DD; giới hạn ngày response_deadline bao gồm cả hai đầu, hỗ trợ một đầu; to không nhỏ hơn from |
| `sort` | document_code / document_name / deadline / assignee / priority / updated_at |
| `direction` | asc (mặc định khi có sort) / desc |
| `page`, `per_page` | page >= 1; per_page 1–100, mặc định 25 |

Sort priority theo low → normal → high → critical; assignee theo full_name. Giá trị null luôn cuối trong sort tường minh; hòa giá trị thì ID tăng dần. Không có sort thì `sort_order ASC, id ASC`. Không suy mức quan trọng pháp lý từ tên/mã tài liệu. `overdue=false` là phần bù, bao gồm deadline null/đúng hiện tại/tương lai và item received/closed. `not_required` không tự loại khỏi overdue, vì cần thiết và tiến độ là hai chiều độc lập. Query sai enum/kiểu/date/sort/page trả Laravel 422 `{message, errors}`.

#### List response

Mỗi phần tử `documents` có:

- `id`, `title`, `document_type: {id, code, name_ja} | null`, `purposes: [{id, code, name_ja}]`.
- `target_person`, `collection_source`, `collection_method`, `target_period_from/to`, `target_scope`.
- `necessity_status`, `collection_status`, `collection_result`, `fulfillment_status`, `review_status`.
- `assigned_employee: {id, display_name} | null`, `requested_at`, `response_deadline`.
- `collection_priority`, `preservation_priority` (boolean), `preservation_reason`.
- `applicability_condition_snapshot`, `is_template_generated` (boolean), `received_document_count`, `created_at`, `updated_at`.

Ngày thuần trả YYYY-MM-DD; datetime trả ISO-8601 UTC, nullable giữ null. `display_name` là Employee.full_name; không trả email, điện thoại, role hay thông tin cá nhân khác của nhân viên. Resource whitelist không serialize toàn bộ model/master relations.

`pagination`: `{current_page, per_page, last_page, total, from, to}`; total là số item sau lọc, from/to null khi trang rỗng. `summary` luôn tính **toàn hồ sơ**, không bị filter hoặc page làm thay đổi:

```json
{
  "total": 55,
  "necessity": {"undetermined": 55, "required": 0, "not_required": 0},
  "overdue": 0,
  "preservation_priority": 1,
  "collection_result_count": 0,
  "filtered_count": 12
}
```

Đây là ví dụ response, không phải dữ liệu vận hành được seed. `collection_result_count` đếm item có result không null; `preservation_priority` đếm cờ true, không phải item priority high.

#### Detail / PATCH response

`document` trả:

- `id`, `title`, `document_type` (thêm description), `purposes`, `is_template_generated`.
- `rule: {version_snapshot, source_snapshot, applicability_condition_snapshot}` từ snapshot đã lưu, không đọc live rule để thay thế.
- `necessity: {status, reason, decided_by: {id, display_name} | null, decided_at}`.
- `collection: {target_person, source, method, target_period_from, target_period_to, target_scope, status, result, requested_at, response_deadline, priority, preservation_priority, preservation_reason}`.
- `fulfillment_status`, `review_status`, `assigned_employee`, `received_document_count`, `received_documents`, `created_at`, `updated_at`.

Mỗi `received_documents` gồm `id`, `title`, `original_filename`, `storage_type`, `external_url`, `version`, `received_at`, `original_or_copy`, `return_required`, `returned_at`, `registered_by_employee: {id, display_name} | null`, `notes`, `relationship_type` từ pivot. Chỉ file chưa soft-delete **cùng case** được trả/đếm, kể cả pivot bị nối sai case trong DB. Cùng file có thể xuất hiện ở nhiều item; cùng item có thể có nhiều file. Không trả `storage_path`, toàn bộ pivot hay thông tin tài khoản. URL chỉ trả cho storage google_drive/external_link có URL hợp lệ http/https trong ranh giới quyền case. Storage upload trả external_url null và chỉ tải qua endpoint được xác thực ở trên.

`POST .../received-documents` dùng `multipart/form-data`: `storage_type` (`upload`, `google_drive`, `external_link`), `title` bắt buộc, `file` bắt buộc khi upload (tối đa 20 MB), hoặc `external_url` bắt buộc khi liên kết (chỉ HTTP/HTTPS). `received_at`, `original_or_copy` (`original`/`copy`), `return_required`, `notes` là tùy chọn. Server ghi người đăng ký từ tài khoản hiện tại, gắn pivot `received`, ghi activity `document_collection.received_document_registered` và **không** tự đổi collection/fulfillment sang hoàn tất. Nếu item đang `reviewed`, file mới reset `review_status` về `unreviewed` để Level 4/5 kiểm tra lại.

#### PATCH contract và tính độc lập

Body là các field phẳng và partial; bỏ qua field nghĩa là giữ nguyên. Chỉ cho phép:

| Field | Validation |
| --- | --- |
| target_person, collection_source | string tối đa 255, nullable |
| collection_method, target_scope | text tự do tối đa 10.000, nullable; không enum hoặc tự suy từ source |
| target_period_from, target_period_to | YYYY-MM-DD nullable; kiểm tra cả giá trị đã lưu của đầu còn lại khi PATCH một phía |
| assigned_employee_id | integer tồn tại, chưa soft-delete; null để bỏ phân công |
| requested_at, response_deadline | date/datetime hợp lệ, nullable; offset đầu vào được chuẩn hóa về timezone ứng dụng để lưu |
| collection_priority | low / normal / high / critical, không null |
| preservation_priority | boolean true/false hoặc 1/0, không null |
| preservation_reason, necessity_reason | string tối đa 5.000, nullable |
| necessity_status, collection_status, fulfillment_status | enum của trục tương ứng ở bảng filter, không null |
| review_status | unreviewed / reviewing / reviewed / returned, không null; chỉ Level 4 hoặc Level 5 được PATCH |
| collection_result | null hoặc not_exist / not_disclosed / partially_disclosed / custodian_unknown / other |

Mã kết quả: `not_exist` = 不存在; `not_disclosed` = 不開示; `partially_disclosed` = 一部不開示; `custodian_unknown` = 保管先不明; `other` = その他. Null nghĩa là chưa ghi nhận ngoại lệ, không phải completed.

Mọi key ngoài allowlist bị từ chối 422, **kể cả khi gửi null**. Bao gồm case_file_id, document_type_id, case_type_document_rule_id, cả ba snapshot, is_template_generated, created_by provenance, necessity_decided_by_employee_id/necessity_decided_at, purposes, received_documents và legacy status/file_url/version. Không sửa master, pivot hoặc diễn giải lại API legacy.

- Candidate != required: không đánh giá applicability_condition.
- Received != reviewed và received != sufficient: cập nhật collection_status không cascade sang review/fulfillment.
- Not required != collection completed: không tự đóng hoặc gán kết quả/trạng thái đủ/đã xem.
- Collection result != collection status: not_exist không tự đổi necessity/fulfillment.
- Preservation priority != collection priority: high + false, normal + true đều hợp lệ.
- Collection method != source: cách thu thập là mô tả độc lập, không lấy từ master gợi ý.

Khi necessity_status **thay đổi** sang required/not_required, hệ thống ghi employee đã xác thực và now(); nếu user không có employee hợp lệ thì từ chối quyết định này bằng 403. Gửi lại cùng status hoặc chỉ sửa reason không thay người/thời điểm quyết định. not_required yêu cầu reason không rỗng/không chỉ whitespace khi cập nhật status/reason, dùng reason hiện có nếu bỏ qua. Khi chuyển về undetermined, xóa reason/actor/time hiện tại (kể cả gửi reason cùng request); history vẫn giữ bản trước. Các PATCH không liên quan necessity không ép sửa quyết định cũ thiếu reason.

`review_status` là bước xác nhận toàn bộ tài liệu sau khi đã kiểm tra việc thu thập và nội dung. Chỉ user có role `level_4` hoặc `level_5` mới được cập nhật field này; các role khác nhận 403, kể cả khi có quyền `case.update`. Các field PATCH khác vẫn dùng quyền `case.update` hiện có.

PATCH khóa CaseFile rồi CaseDocument trong transaction, đọc state mới nhất để validate các cặp giá trị partial. Mỗi lần có thay đổi thật ghi một `case_activities` qua `CaseWorkspaceAuditService`, title `資料収集項目を更新`, metadata gồm event `document_collection.updated`, document_id, actor_user_id, `changes` chứa before/after từng field thay đổi (bao gồm actor/time do server ghi). Nhân viên, thời điểm và tên item nằm trong activity theo convention workspace. Bao phủ đổi trạng thái, review/returned, yêu cầu thêm, khó thu thập, reason, assignee/deadline và preservation. Audit thất bại rollback cả update và history. PATCH no-op không thay updated_at hoặc tạo history thừa. Security audit 401/403/429 hiện có giữ nguyên; không đưa nội dung tài liệu sang external logger.

Kiểm chứng Phase 1E-A ngày 2026-08-31: 97 test API mới; toàn bộ backend **322 tests / 3.078 assertions PASS**, gồm regression generator và workspace legacy. Frontend production build PASS, cảnh báo bundle >500 kB hiện có. SQL list/filter/6 sort được kiểm tra thêm trên MySQL trong transaction READ ONLY, không tạo fixture trên DB vận hành. Master giữ nguyên checksum/count 78/11/103/107; clients/case_files/case_documents vẫn 0/0/0. Không migration/seed/deploy trong phase này.

### V2 checklist initialization — Phase 1E-B

Luồng tường minh: case → preview ứng viên → người vận hành xác nhận → POST initialize → GET collection hiện có. **Candidate != required**: mọi item mới vẫn necessity_status=undetermined; không đánh giá điều kiện áp dụng. Không tự khởi tạo V2 hoặc áp dụng template legacy khi tạo CaseFile; legacy chỉ còn qua API tường minh. Phase 1E-B không nối frontend hoặc thay mock data; tích hợp frontend sau đó được mô tả riêng.

| Method & path | Quyền | Hành vi |
| --- | --- | --- |
| `GET /case-files/{caseFile}/document-collection/initialization-preview` | `case.view` | Chỉ đọc kế hoạch hiện tại và cảnh báo coexistence |
| `POST /case-files/{caseFile}/document-collection/initialize` | `case.update` | Gọi generator, chỉ tạo candidate còn thiếu |

Cả hai static route nằm trước route động `/{caseDocument}`. Giữ Sanctum, password-change restriction, throttle và RBAC CaseWorkspace hiện có; không thêm role bypass hoặc ACL mới. POST không có business payload: mọi field body/query, kể cả null, bị từ chối 422, không nhận document/rule IDs, actor, necessity/status hay purposes. Không cần idempotency key. GET không thay checklist/pivot/snapshot/master/activity; middleware auth/throttle hiện có không bị bỏ qua.

Preview trả trực tiếp:

```json
{
  "case": {"id": 123, "case_type": {"id": 10, "name": "労災"}},
  "initialization": {
    "available": true,
    "candidate_count": 55,
    "existing_generated_count": 0,
    "missing_candidate_count": 55,
    "skipped_candidate_count": 0,
    "manual_item_count": 0,
    "total_existing_collection_items": 0,
    "legacy_item_count": 0,
    "soft_deleted_generated_count": 0
  },
  "purposes": [{"code": "COMMON", "name_ja": "事件共通の資料", "candidate_count": 4}],
  "warnings": []
}
```

IDs/purpose list trên chỉ là ví dụ rút gọn. `purposes` đếm theo toàn bộ tập candidate đã resolve, không chỉ phần thiếu. Một candidate phục vụ nhiều purpose nên tổng purpose counts có thể lớn hơn candidate_count; không dùng tổng này làm số checklist duy nhất.

`candidate_count` là số ứng viên hiệu lực sau kế thừa/dedup; `missing_candidate_count` dùng đúng guard chống trùng của generator, `skipped_candidate_count = candidate - missing`. Các count existing/manual/total/legacy chỉ xét item chưa soft-delete. `existing_generated_count` đếm cờ is_template_generated có sẵn, **kể cả cờ của template cũ**, không khẳng định toàn bộ đã sinh bằng V2. Manual count đếm cờ false. Legacy count cảnh báo item có template_item_id, thiếu document_type_id, có file_url hoặc legacy status khác not_requested; count có thể chồng với manual/generated, không cộng các count này thành total. Legacy dấu hiệu không được dùng để tự di chuyển/gộp dữ liệu.

Generated item đã soft-delete vẫn chặn sinh lại theo generator hiện có, không tự restore; soft_deleted_generated_count và warning giải thích trường hợp missing=0 nhưng active total giảm. Item của rule bị bỏ/vô hiệu vẫn giữ nên existing có thể lớn hơn candidate. Manual có cùng document type vẫn hợp lệ theo nguồn/đối tượng/kỳ/phạm vi khác nhau; chỉ duplicate ngữ cảnh hẹp được bỏ qua, không sửa hoặc gắn lại purpose cho item manual.

Warning structure: `{code, message}` (tiếng Nhật), gồm:

- `manual_items_present`: có mục nhập tay, nên kiểm tra trùng.
- `legacy_document_items_present`: có dấu hiệu template/legacy coexistence, không tự migrate.
- `deleted_generated_items_present`: mục generated đã xóa sẽ không tự tạo lại.
- `no_rules`: case type hợp lệ nhưng không có rule hiệu lực; candidate/missing=0, POST 200 no-op, không activity.
- `case_type_missing`: selected type null/không tồn tại; preview 200 với available=false và case_type=null, POST 422 `code: case_type_required`.

Warning coexistence không chặn POST. Hierarchy lỗi hoặc metadata candidate không thể lưu an toàn trả 422 `checklist_planning_unavailable`, không lộ stack trace, model name hoặc ID rule nội bộ. Case đã xóa/không tồn tại trả 404. Case type hợp lệ ở đây là ID tồn tại; không thêm một bộ lọc is_active của type khác với generator hiện có.

POST thành công trả 200:

```json
{
  "initialization": {
    "candidate_count": 55,
    "created_count": 55,
    "skipped_count": 0,
    "created_case_document_ids": [201, 202],
    "total_collection_items": 55
  }
}
```

Danh sách IDs trong ví dụ đã rút gọn; response thật chứa IDs mới tạo, không trả lại toàn bộ item. Lần hai created=0/skipped=55 và không activity mới. Nếu sau này master thêm 2 ứng viên thiếu, preview missing=2, POST chỉ tạo 2; không sửa quyết định hoặc snapshot cũ.

Preview và generator dùng chung private `plan()` của `CaseDocumentChecklistGenerator`: cùng lineage, active/effective rules, latest version mỗi cấp, nearest child metadata, union purpose và manual/generated duplicate guard. Preview không lock/write, là ảnh chụp mang tính tham khảo, không giữ chỗ hoặc đóng băng master. POST re-plan trạng thái mới nhất dưới khóa case, không tin count hoặc composition từ frontend.

Generator giữ transaction riêng, parent `FOR UPDATE` và current locking read trên existing documents. Controller có outer transaction cùng thứ tự khóa chỉ để kiểm tra type dưới khóa và bảo đảm activity atomic; generator dùng nested transaction/savepoint hiện có, không commit sớm khỏi outer transaction. Hai initialize hợp tác qua cùng case lock sẽ không tạo trùng; writer legacy không dùng khóa này nằm ngoài bảo đảm đó. Preview và POST có thể khác nếu rule/case đổi giữa hai request.

Khi created_count>0, ghi một case activity qua `CaseWorkspaceAuditService`: title `資料収集リストを作成`, metadata event `document_collection_initialized`, actor_user_id, created_count, candidate_count. case/employee/time dùng convention activity hiện có; user không gắn employee vẫn có actor_user_id, created_by_employee_id nullable như các workspace activity khác. Audit lỗi rollback toàn bộ tài liệu/purpose được tạo. Không ghi activity cho no-op; không event sourcing.

Giới hạn cross-domain: traffic case chỉ dùng lineage/rules traffic hiện tại (48 ứng viên, gồm các mục cross-domain có điều kiện đã có trong master). Không tự thêm toàn bộ 55 mục 労災 vào mọi traffic case. Tự kết hợp nhiều case type hoặc thuộc tính “業務中・通勤中” cần phase riêng. **Initialize không liên hệ bên ngoài**, không upload, gửi yêu cầu, thực thi approval, OCR hoặc quyết định pháp lý AI.

Kiểm chứng Phase 1E-B ngày 2026-08-31: 18 test initialization API / 387 assertions khi chạy riêng; toàn bộ backend **340 tests / 3.462 assertions PASS**, bao gồm 1E-A API và generator regression. Bốn parent/subtype lần lượt 55/48/48/55; lần hai tạo 0, rule mới chỉ thêm phần thiếu, quyết định/manual/legacy và snapshots giữ nguyên. Frontend build PASS (cảnh báo bundle >500 kB hiện có). Master checksum/count giữ 78/11/103/107; local clients/case_files/case_documents = 0/0/0. Generation tests chạy SQLite cô lập; khóa MySQL FOR UPDATE được giữ nguyên nhưng phase này chưa chạy thử tải hai request MySQL đồng thời. Không initialize DB local đang dùng, không sửa frontend, gửi bên ngoài hoặc deploy.

## Chấm công và báo cáo

| Method & path | Khóa | Nội dung request | Hành vi |
| --- | --- | --- | --- |
| `GET /attendances/active` | Có | — | Danh sách tất cả attendance chưa clock-out ở trạng thái `working`, `break`, `outside`, kèm profile và work session active. |
| `POST /attendances/start` | Có | — | Bắt đầu attendance của chính nhân viên đang đăng nhập; nếu đã có attendance mở thì trả lại bản đó. |
| `PATCH /attendances/{attendance}/status` | Có | Xem bên dưới | Cập nhật trạng thái attendance thuộc chính nhân viên. |
| `GET /attendances/my-report` | Có | — | Download file `.xlsx` của duy nhất nhân viên hiện tại; response là stream với `Content-Disposition`. |

Payload đổi trạng thái:

```json
{ "status": "break" }
```

```json
{
  "status": "outside",
  "outside_start": "10:00",
  "outside_expected_end": "12:00",
  "outside_destination": "大阪法務局で書類提出"
}
```

`status` phải là `working`, `break`, `outside` hoặc `offline`. Ba trường `outside_*` là bắt buộc khi `status = outside`; thời gian có dạng `HH:mm`. Thời gian dự kiến nhỏ hơn/bằng lúc bắt đầu được hiểu là ngày kế tiếp. Attendance đã `clock_out` không thể đổi thêm.

## Work session

| Method & path | Khóa | Nội dung request | Hành vi |
| --- | --- | --- | --- |
| `POST /work-sessions` | Có | `attendance_id`, `task_description` (tối đa 255), `expected_end_time` (`HH:mm`) | Hoàn tất phiên active trước đó (nếu có), tạo phiên mới active và đồng bộ Excel. |
| `PATCH /work-sessions/{workSession}/complete` | Có | — | Hoàn tất idempotent work session thuộc attendance của người gọi. |

`attendance_id` phải tồn tại, thuộc người gọi và chưa clock-out. Nếu giờ kết thúc dự kiến không còn ở tương lai trong ngày, backend chuyển sang ngày mai.

## Tổ chức và giao việc

| Method & path | Khóa | Nội dung request | Hành vi |
| --- | --- | --- | --- |
| `GET /organization` | Có | — | Nhân viên, office/department, trạng thái hiện tại, task hiện tại và tổng `summary`. PII chỉ có cho manager/admin. |
| `POST /employees` | Có, `employee.create` | `full_name`, `office_id`, `hire_date`; tùy chọn `full_name_kana`, `position_title`, `work_email`, `gender` | Backend phát hành `employee_code` bất biến từ `offices.office_code`: `THEMIS → TMS-YYNNN`, `CHUKA_LAW → TLW-YYNNN`. Không nhận `employee_code` từ client; response trả nhân viên kèm mã đã phát hành. |
| `POST /employees/{employee}/tasks` | Có | `title`, `description` (tùy chọn, tối đa 5000), `duration_minutes`: `30`, `60` hoặc `120` | Giao task mới ở trạng thái `pending`, gắn với đúng một employee. Người nhận phải đang online và người giao không thể tự giao việc cho chính mình. |
| `GET /my/tasks` | Có | — | Các task của employee hiện tại có trạng thái `pending`, `accepted`, `in_progress`, bao gồm task được tạo khi xác nhận mục C「依頼・準備」của tài liệu. |
| `PATCH /tasks/{task}/accept` | Có | — | Chỉ nhân viên nhận task đó có thể chuyển `pending` sang `accepted`, và đặt `accepted_at`. |
| `PATCH /tasks/{task}/status` | Có | `status`: `in_progress` hoặc `completed` | Nhân viên nhận task bắt đầu task đã xác nhận, hoặc hoàn tất task đang thực hiện. Khi bắt đầu, API tạo `work_session` liên kết với attendance đang mở để Current Task luôn đồng bộ. |
| `PUT /employees/{employee}/password-reset` | Có, Level 4/5 | — | Hệ thống tự tạo mật khẩu tạm 12 ký tự và chỉ trả về một lần trong phản hồi để quản trị viên sao chép gửi cho nhân viên. Thu hồi token và bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo. Level 4 không thể đặt lại mật khẩu Level 5. |

Chỉ `manager` và `admin` được giao việc. Mỗi task luôn gắn với đúng một `employee_id` từ URL `/employees/{employee}/tasks`, không có danh sách task dùng chung. Employee chỉ có thể cập nhật task của chính mình theo luồng `pending → accepted → in_progress → completed`. Đồng hồ bắt đầu đếm từ `accepted_at`, không tính từ lúc manager giao việc.

## 在留申請進捗管理

| Method & path | Khóa | Hành vi |
| --- | --- | --- |
| `GET /visa-progress` | Có, `case.view` | Đọc workbook Excel đã cấu hình trong Google Drive, chuẩn hoá và trả dashboard. Chỉ đọc, không ghi file hay database. |

Gửi `?refresh=1` để bỏ cache ngắn và lấy workbook mới nhất. Khi Google Drive chưa cấu hình, endpoint trả `503` với `code: google_drive_not_configured`. File không truy cập được, lỗi nguồn hoặc file Excel không hợp lệ được trả về bằng message/code an toàn, không chứa credential hay exception stack trace.

Ví dụ response (đã rút gọn):

```json
{
  "data": {
    "source": {
      "name": "在留申請進捗管理.xlsx",
      "modified_at": "2026-08-25T01:05:00+00:00",
      "synced_at": "2026-08-25T01:06:00+00:00",
      "sheet_name": "追加資料管理"
    },
    "summary": {
      "total": 12,
      "in_review": 3,
      "additional_documents": 2,
      "approved": 4,
      "attention_required": 2
    },
    "applications": [
      {
        "id": "VISA-001",
        "case_id": "VISA-001",
        "applicant_name": "山田 太郎",
        "case_type": "在留期間更新",
        "status": "審査中",
        "responsible_person": "鈴木",
        "application_date": "2026-08-10",
        "deadline": "2026-08-28",
        "deadlines": [{ "label": "追加資料提出期限", "date": "2026-08-28" }],
        "days_remaining": 3,
        "deadline_level": "critical",
        "residence_deadline": null,
        "supplement_deadline": {
          "label": "追完期限 1回目",
          "date": "2026-08-28",
          "category": "supplement",
          "days_remaining": 3,
          "deadline_level": "critical"
        }
      }
    ]
  }
}
```

`deadline_level` là `overdue`, `critical` (0–5 ngày), `warning` (6–10 ngày), `notice` (11–15 ngày), `upcoming` (16–30 ngày), `normal` hoặc `none`. Với workbook vận hành đầy đủ, `residence_deadline` chỉ được tính từ `在留期限` khi status là `新規受付` hoặc `申請準備完了`; `supplement_deadline` chỉ được tính từ `追完期限 1回目〜3回目` khi status là `審査中` hoặc `追加資料依頼①〜③`. Hai trường này giữ riêng trạng thái deadline để dashboard không trộn hai luồng nghiệp vụ. `deadline` vẫn được giữ làm deadline vận hành đại diện cho bảng/lọc tương thích. Response cũng có `deadline_label`, `deadline_category` (`residence`/`supplement`) và `message_link` khi `請求関係` có liên kết Messenger HTTPS hợp lệ. Status không có trong mapping vẫn được trả nguyên văn từ workbook.

## Dạng response và lỗi

### V2: tạm ngừng AI task legacy và execution cũ

- `GET /api/personas` trả `task_management` khi persona được cấp skill này. AI chỉ nhận snapshot task mở của chính employee đã xác thực; không thể thay đổi task qua chat. `morning_briefing` vẫn không khả dụng.
- `POST /api/ai/chat` trả `422`, `code: ai_skill_unavailable` nếu yêu cầu skill bị tắt hoặc không thuộc persona. Không gọi provider/tool trong trường hợp này. Các kiểm tra đăng nhập/quyền vẫn giữ.
- Endpoint execution cũ của approval trả `410`, `code: legacy_execution_unavailable` sau middleware xác thực/phân quyền. Không đọc Task hoặc thực thi payload cũ; không chuyển `task_id` sang `case_tasks`.
- Approval list/approve/reject và thông báo vẫn giữ. `request_approval` từ chối `action_type` hoặc `tool_name` là `delete_task`; frontend bỏ nút execution. AI page/mascot hiển thị thông báo tạm dừng khi không còn skill khả dụng.

Response thành công thường bao bọc thực thể dưới các khóa `user`, `attendance`, `work_session`, `task`, `tasks`, hoặc `employees`. Response validation Laravel có mã `422` và trường `errors`; lỗi ownership là `403`, không có token là `401`, quá rate limit là `429`.

Ví dụ đăng nhập thành công (đã rút gọn):

```json
{
  "message": "ログインしました。",
  "user": {
    "id": 1,
    "email": "employee@example.com",
    "role": "employee",
    "employee": { "id": 1, "employee_code": "TMS-26001", "status": "active" }
  },
  "token": "1|..."
}
```

Tất cả API response được thêm các security header, không cache, và lỗi 401/403/429 được audit (có khử trùng lặp). Xem chi tiết trong [DATA_MODEL.md](DATA_MODEL.md).
