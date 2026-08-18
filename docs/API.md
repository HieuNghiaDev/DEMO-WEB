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
| `POST /logout` | Có | — | Xóa token hiện tại và trả thông báo. |

Token không ghi nhớ hết hạn sau 12 giờ; token có `remember: true` hết hạn sau 30 ngày. Frontend lưu token vào `sessionStorage` hoặc `localStorage` tương ứng.

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

Chỉ `manager` và `admin` được giao việc. Mỗi task luôn gắn với đúng một `employee_id` từ URL `/employees/{employee}/tasks`, không có danh sách task dùng chung. Employee chỉ có thể cập nhật task của chính mình theo luồng `pending → accepted → in_progress → completed`. Đồng hồ bắt đầu đếm từ `accepted_at`, không tính từ lúc manager giao việc.

## Dạng response và lỗi

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
