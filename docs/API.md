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

Khách hàng (`clients`) lưu dữ liệu liên hệ: `phone`, `email`, `address`, `nationality`, cùng `name`, `name_kana` và `client_type` (`individual`/`corporate`). Khi tạo mới `case-files`, payload `client` có thể bao gồm các trường này; email hợp lệ, điện thoại tối đa 30 ký tự, địa chỉ tối đa 255 ký tự. `GET /case-files/{id}` trả toàn bộ thông tin liên hệ của khách hàng để hiển thị trong hồ sơ; `PUT /clients/{client}` cập nhật hồ sơ khi người gọi có `case.update`.

Mỗi hồ sơ có thể có tab tự do ngoài ba tab mặc định. `POST /case-files/{caseFile}/custom-sections` tạo tab với `title` (bắt buộc, tối đa 80 ký tự) và `content` (tùy chọn). `PATCH` hoặc `DELETE /case-files/{caseFile}/custom-sections/{customSection}` cập nhật hoặc xóa tab; các thao tác này yêu cầu quyền `case.update`.

### Workspace hồ sơ và checklist

Phase 1D bổ sung application service `CaseDocumentChecklistGenerator::generateForCase`, **không có endpoint mới và chưa tự gọi khi POST tạo CaseFile**. API hiện vẫn dùng template engine cũ; rule generator được giữ riêng vì template item chưa ánh xạ document_type, gọi cả hai sẽ tạo mục trùng. Caller backend tương lai phải kiểm tra quyền trước khi gọi service. Xem [PHASE_1D_CHECKLIST_GENERATOR.md](PHASE_1D_CHECKLIST_GENERATOR.md) về transaction, inheritance và snapshot.

| Method & path | Quyền | Hành vi |
| --- | --- | --- |
| `GET /case-files/{id}/workspace` | `case.view` | Trả hồ sơ, checklist, bên liên quan, deadline, task, timeline và summary tiến độ. |
| `POST /case-files/{id}/apply-document-template` | `document.create` | Áp dụng template đang hiệu lực; chạy lại không tạo trùng checklist. |
| `POST/PATCH/DELETE /case-files/{id}/parties/...` | `case.update` | Quản lý gia đình, công ty, đối phương, bảo hiểm, bệnh viện và bên liên quan khác. |
| `POST/PATCH/DELETE /case-files/{id}/deadlines/...` | `case.update` | Quản lý hạn lưu trú, nộp hồ sơ, bổ sung, thời hiệu và hạn nội bộ. |
| `POST/PATCH/DELETE /case-files/{id}/case-tasks/...` | `case.update` | Quản lý task gắn trực tiếp với hồ sơ. |
| `POST /case-files/{id}/activities` | `case.update` | Ghi lịch sử liên lạc, sự kiện, nộp hồ sơ, y tế, tai nạn hoặc ghi chú nội bộ. |

Tài liệu hỗ trợ `requirement_level`: `required`, `conditional`, `optional`; và trạng thái nghiệp vụ: `not_requested`, `requested`, `waiting`, `received`, `reviewing`, `deficient`, `resubmission_requested`, `confirmed`, `submitted`, `not_required`. Tài liệu thêm thủ công không phụ thuộc template. Xóa tài liệu dùng soft delete để phục hồi/audit về sau.

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
| `POST /employees/{employee}/tasks` | Có | `title`, `description` (tùy chọn, tối đa 5000), `duration_minutes`: `30`, `60` hoặc `120` | Giao task mới ở trạng thái `pending`, gắn với đúng một employee. |
| `GET /my/tasks` | Có | — | Các task của employee hiện tại có trạng thái `pending`, `accepted`, `in_progress`. |
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

- `GET /api/personas` không trả `task_management` hoặc `morning_briefing` trong danh sách skills, kể cả khi DB vẫn lưu cấu hình cũ.
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
    "employee": { "id": 1, "employee_code": "TM001", "status": "active" }
  },
  "token": "1|..."
}
```

Tất cả API response được thêm các security header, không cache, và lỗi 401/403/429 được audit (có khử trùng lặp). Xem chi tiết trong [DATA_MODEL.md](DATA_MODEL.md).
