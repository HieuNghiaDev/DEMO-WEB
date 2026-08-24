# EmployeeManagement - AI Development Progress

## 1. Project stack

Backend:

- Laravel / PHP
- MySQL
- Laravel Sanctum
- REST API

Frontend:

- React
- Vite
- TypeScript
- Tailwind CSS
- Axios

AI module:

- AI社員 / AI秘書
- AI agent có khả năng sử dụng tools để thao tác dữ liệu trong hệ thống.

---

# 2. AI Goal

Mục tiêu AI秘書:

- Nhận yêu cầu từ người dùng qua chat.
- Hiểu persona và skill.
- Có thể đọc task.
- Có thể tạo task.
- Có thể cập nhật task.
- Ghi log hành động AI.
- Hỗ trợ morning briefing từ task hiện có.
- Sau này hỗ trợ quản lý công việc chủ động.
- Có thể sử dụng Claude hoặc AI provider thật.
- Hiện tại ưu tiên Fake Mode để phát triển mà không cần API key.

---

# 3. Database đã làm

Các bảng AI liên quan đã được tạo:

- clients
- matters
- tasks
- secretary_logs
- approval_requests
- personas
- skill_proposals

Models và relationships cơ bản đã được tạo.

Persona mặc định:

- AI秘書
- active

---

# 4. Persona API

Đã có API:

GET /api/personas

Frontend có thể load persona từ backend.

PersonaSeeder đã chạy thành công.

---

# 5. Markdown AI definitions

Đã có:

secretary/personas/secretary.md

Skills:

secretary/skills/task_management.md
secretary/skills/morning_briefing.md

Đã có services:

- MarkdownDefinitionLoader
- PersonaLoader
- SkillLoader

Tests đã được tạo cho loader.

---

# 6. AI Tools

Đã có Tool interface và ToolRegistry.

Tools hiện có:

- list_tasks
- create_task
- update_task
- log_action
- request_approval

ToolRegistry chịu trách nhiệm đăng ký và tìm tool.

---

# 7. Claude integration đã chuẩn bị

Đã có:

- ClaudeClient
- ClaudeToolSchemaConverter
- SystemPromptBuilder

Config:

config/anthropic.php
config/ai.php

Environment có các biến:

AI_FAKE_MODE=true

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

AI_ORCHESTRATOR_MAX_ITERATIONS=8

Hiện tại KHÔNG phụ thuộc API Claude thật.

Ưu tiên Fake Mode trong quá trình development.

Fake Mode hiện hỗ trợ end-to-end qua AIOrchestrator và ToolRegistry:

- list_tasks
- create_task
- update_task với các câu lệnh hoàn thành task bằng tiếng Nhật, tiếng Việt và tiếng Anh
- morning_briefing với câu lệnh xác định `今日の朝会ブリーフィングをお願いします`
- approval request cho xóa task với câu lệnh xác định `Task <id> を削除して`

Fake Mode nhận diện `update_task` theo các mẫu xác định, ví dụ:

- Nhật: `Task 1 を完了にして`, `タスク1を完了してください`, `1番のタスクを完了にして`
- Việt: `Hoàn thành task 1`, `Đánh dấu task 1 hoàn thành`, `Hoàn tất task 1`
- Anh: `Complete task 1`, `Mark task 1 as completed`, `Finish task 1`

Task ID được lấy từ phần số đi cùng `Task/タスク`. Các câu chỉ chứa số nhưng không nói về task không gọi nhầm `update_task`.

Mỗi tool execution được AIOrchestrator ghi vào `secretary_logs`.
Fake Mode bị chặn khi `APP_ENV=production`.

Morning Briefing dùng đúng kết quả thật của `list_tasks`, loại task đã completed khỏi phần việc cần làm, ưu tiên `horizon=short`, hiển thị tối đa 5 task cần chú ý và đề xuất thứ tự xử lý.

Approval workflow tối thiểu dùng `RequestApprovalTool` hiện có:

- Tạo record `approval_requests` trạng thái `pending` cho action `delete_task`.
- Lưu `requested_by` từ người dùng đã xác thực và `payload.task_id`.
- Không xóa task trước khi có human approval.
- Fake Mode trả lời rõ approval đã được yêu cầu và hành động chưa được thực hiện.

Approval Management đã có API và giao diện quản lý tối thiểu:

- `GET /api/approvals` yêu cầu permission `approval.view`.
- `PATCH /api/approvals/{approval}/approve` và `/reject` yêu cầu permission `approval.approve`.
- Chỉ request `pending` được chuyển sang `approved` hoặc `rejected`; request đã xử lý trả HTTP 409.
- Việc approve chỉ cập nhật trạng thái cùng người/thời điểm xử lý, chưa thực thi protected action.
- `/approvals` hiển thị danh sách, payload, người yêu cầu, trạng thái và các nút duyệt/từ chối cho request pending.
- `POST /api/approvals/{approval}/execute` thực thi riêng action `delete_task` sau khi request đã approved.
- AI task tools và protected delete đều dùng `App\Models\Task` / bảng `tasks`, không dùng `employee_tasks`.
- Execution chỉ dùng `payload.task_id` đã được duyệt, không nhận task ID thay thế từ client.
- `executed_by` và `executed_at` bảo vệ idempotency; transaction cùng row lock ngăn hai request xóa lặp.
- Execution thành công/thất bại được ghi vào `secretary_logs` với `trigger_type=approval_execution`.

---

# 8. AI Orchestrator

Đã có:

AIOrchestrator

Flow dự kiến:

User message
↓
Persona
↓
Skill
↓
System Prompt
↓
AI
↓
tool_use
↓
ToolRegistry
↓
Tool execution
↓
tool_result
↓
AI
↓
Final response

AIOrchestrator hỗ trợ agentic loop nhiều vòng.

Có giới hạn:

AI_ORCHESTRATOR_MAX_ITERATIONS

---

# 9. AI Chat API

Đã có API:

POST /api/ai/chat

Request dạng:

{
"persona": "...",
"skill": "...",
"message": "...",
"messages": [
{
"role": "user",
"content": "previous user message"
},
{
"role": "assistant",
"content": "previous assistant response"
}
]
}

`messages` là lịch sử tùy chọn, tối đa 20 tin nhắn. Chỉ chấp nhận role `user` và `assistant`; mỗi content tối đa 4000 ký tự. `message` hiện tại được backend nối đúng một lần vào cuối lịch sử trước khi gọi AIOrchestrator.

Request có thể gửi thêm `context` tùy chọn với dữ liệu định danh tối thiểu. Các page hợp lệ gồm `employee_room`, `organization`, `business_quest`, `manual_workshop`, `ai_workspace`, `approvals`; chỉ `business_quest` được nhận `case_id` và chỉ `approvals` được nhận `approval_id`. Key lạ, object lồng sâu hoặc ID sai page đều bị từ chối. Context được chuyển vào `AIOrchestrator` qua `triggerContext.page_context` và chỉ các identifier an toàn mới được thêm vào system prompt; hệ thống chưa tự tải dữ liệu protected từ các ID này.

Request cũ không có `messages` vẫn tương thích.
Request cũ không có `context` vẫn tương thích.

Response dự kiến:

{
"data": {
"persona": "...",
"skill": "...",
"message": "...",
"tool_executions": []
}
}

Endpoint được bảo vệ bằng Laravel Sanctum và permission `ai.use`.

Controller:

Api\AiChatController

---

# 10. Frontend AI

Route:

/ai

Trang AI đã không còn là ComingSoon.

Đã có:

- Load persona
- Chat UI
- Message history
- Input message
- Enter để gửi
- Shift + Enter xuống dòng
- Loading state
- Gửi tối đa 20 tin nhắn user/assistant gần nhất cùng request mới
- Không lặp lại message hiện tại trong history
- Có selector nhỏ để chọn `タスク管理` hoặc `朝会ブリーフィング` từ danh sách skill của persona
- Có THEMIS AI Floating Assistant được mount trong authenticated `MainLayout` cho user có `ai.use`.
- Floating button mở panel ngay trên trang hiện tại; desktop dùng right drawer, mobile dùng bottom sheet gần full-screen.
- Panel dùng chung helper `/api/personas` và `POST /api/ai/chat` với trang `/ai`, hỗ trợ skill, Enter/Shift+Enter, loading/error và tối đa 20 history messages không lặp current message.
- Hội thoại floating được giữ trong state của layout khi điều hướng giữa các page trong cùng frontend session; refresh sẽ xóa hội thoại.
- Panel chỉ gửi page identity và safe route ID nếu có, không đọc DOM, customer text hoặc document content.
- `/ai` vẫn là AI workspace đầy đủ và tiếp tục hoạt động độc lập.

Loading Japanese:

AIが考えています…

Có xử lý lỗi cơ bản.

---

# 11. Demo data

Đã từng chạy:

php artisan db:seed --class=AiDemoSeeder

PersonaSeeder chạy thành công.

Đã kiểm tra Task bằng:

App\Models\Task::all();

Có demo task trong database.

---

# 12. Current development state

AI architecture cơ bản đã được dựng.

Fake Mode task management đã được xác nhận qua `POST /api/ai/chat` mà không cần Anthropic API key:

- list_tasks hoạt động qua HTTP API với cả `今日のタスクを見せて` và câu trình duyệt `タスク一覧を見せて`.
- create_task hoạt động.
- update_task hoạt động với các cách diễn đạt hoàn thành task bằng tiếng Nhật, tiếng Việt và tiếng Anh.
- Task ID khác nhau được trích xuất an toàn, ví dụ `Complete task 25` cập nhật task ID 25.
- Câu chứa số không liên quan như ngày tháng hoặc số lượng tài liệu không gọi nhầm `update_task`.
- Task được cập nhật trong database.
- `tool_executions` trả về execution của tool.
- AIOrchestrator ghi success/failed vào `secretary_logs`.
- API chat nhận và validate lịch sử hội thoại tùy chọn rồi truyền đầy đủ vào AIOrchestrator.
- Frontend `/ai` gửi tối đa 20 tin nhắn gần nhất; chưa lưu hội thoại vào database.
- Fake Mode chấp nhận message history nhưng chưa thực hiện suy luận tham chiếu nâng cao.
- Morning Briefing hoạt động end-to-end qua API chat mà không cần Anthropic API key.
- Fake Mode gọi `list_tasks`, tạo briefing từ task thật và không trình bày task completed như công việc chưa làm.
- `tool_executions` và `secretary_logs` ghi nhận execution `list_tasks` của skill `morning_briefing`.
- `task_management` khai báo `request_approval` và Fake Mode hỗ trợ yêu cầu xóa task cần duyệt.
- API chat trả execution `request_approval`; approval được lưu pending và task vẫn nguyên trạng.
- Approval Management API cho phép tài khoản có quyền xem, approve hoặc reject request theo state transition an toàn.
- Approve request `delete_task` vẫn không xóa task; task chỉ bị xóa sau explicit execute request riêng.
- Approved `delete_task` có thể được thực thi đúng một lần qua ApprovalGuard, transaction và payload đã duyệt.
- Pending, rejected, unsupported, thiếu task ID, task không tồn tại và execution lặp đều bị chặn.
- Frontend `/approvals` đã hoạt động, có loading/error/empty state, responsive và hỗ trợ light/dark theme.
- Approval Room chỉ hiện `実行` cho approved `delete_task` chưa chạy, yêu cầu xác nhận destructive action và hiển thị `実行済み` sau thành công.
- Khi AI tạo approval pending, hệ thống dùng `EmployeeNotification` hiện có để gửi thông báo chưa đọc cho mọi tài khoản active có quyền `approval.approve` (bao gồm level 5/admin).
- Approval notification chứa `approval_id`, `action_type`, `requester_id` và `target_path=/approvals`; click trong bell đánh dấu đã đọc rồi mở Approval Room.
- Thông báo approval không được gửi cho viewer-only, tài khoản inactive hoặc người không có quyền; khóa approval và kiểm tra metadata ngăn tạo trùng theo approval + recipient.
- THEMIS AI Floating Assistant hoạt động toàn cục trong authenticated layout, giữ nguyên route hiện tại khi mở/đóng và có link riêng để chuyển sang `/ai`.
- Frontend ẩn floating assistant nếu user không có `ai.use`; middleware backend vẫn là lớp RBAC quyết định.
- Page context đã được whitelist, lọc lần hai tại orchestrator và đưa vào system prompt dưới dạng identifiers-only; chưa dùng để tự truy vấn case/approval.
- RBAC `ai.use` tiếp tục chặn tài khoản đã đăng nhập nhưng không có quyền.

Suite unit/feature notification, AI, approval và RBAC trực tiếp bị ảnh hưởng tại checkpoint Floating Assistant 2026-08-24: 56 passed, 264 assertions. Pint, frontend lint (không có error) và production build đều pass.

CHƯA cần làm lại:

- Persona
- Markdown loader
- Skill loader
- ToolRegistry
- AI tools cơ bản
- Claude preparation layer
- AIOrchestrator architecture
- AI chat endpoint
- AI frontend chat UI

---

# 13. NEXT TASK

AI Approval Workflow, Approval Management và safe execution cho `delete_task` đã hoàn thành:

- Tái sử dụng `RequestApprovalTool`, `ApprovalRequest`, bảng `approval_requests` và `ApprovalGuard` hiện có.
- Fake Mode nhận `Task <id> を削除して` và gọi `request_approval`.
- Approval lưu `action_type=delete_task`, `tool_name=delete_task`, `payload.task_id`, `requested_by` và `status=pending`.
- Task không bị xóa và AI không tuyên bố hành động đã hoàn thành.
- `tool_executions` cùng `secretary_logs` ghi nhận request approval.
- Đã có API list/approve/reject dùng schema `approval_requests` hiện có và RBAC `approval.view` / `approval.approve`.
- `/approvals` đã thay Coming Soon bằng Approval Room tối thiểu.
- State transition chỉ cho phép `pending` → `approved` hoặc `pending` → `rejected`.
- Approve không tự chạy action; explicit `POST /api/approvals/{approval}/execute` mới xóa task.
- Execution chỉ hỗ trợ `delete_task`, kiểm tra ApprovalGuard, action/tool/payload và xóa đúng record trong bảng `tasks`.
- Migration tối thiểu thêm `executed_by` và `executed_at` để chống execution lặp và hỗ trợ audit/UI.
- Mỗi execution attempt được ghi vào `secretary_logs`; task đã xóa không thể bị xóa lần hai qua cùng approval.

Giới hạn còn lại: chưa hỗ trợ protected action khác ngoài `delete_task`, pagination phía server, email/browser push hoặc lịch sử ghi chú quyết định. Approval notification hiện dùng polling notification sẵn có (20 giây), chưa phải realtime push. Floating chat chưa persist qua refresh và page context mới chỉ được vận chuyển/validate, chưa resolve dữ liệu entity.

Không tự động mở rộng thêm Fake Mode NLP, automatic execution ngay khi approve, protected action khác, scheduler, email/browser push, persistent conversation memory, reference resolution hoặc frontend redesign ngoài `/approvals` trong checkpoint này.

Task tiếp theo phải được xác nhận riêng trước khi triển khai.

---

# 14. Development rules

IMPORTANT:

1. Không rewrite architecture nếu không cần thiết.
2. Không xóa chức năng hiện tại.
3. Không thay đổi database tùy tiện.
4. Không đọc toàn bộ project nếu chưa cần.
5. Bắt đầu từ AI_PROGRESS.md.
6. Sau đó chỉ đọc những file liên quan trực tiếp tới AI.
7. Trước khi sửa code, kiểm tra implementation hiện tại vì code có thể đã thay đổi sau checkpoint này.
8. Ưu tiên sửa nhỏ, incremental.
9. Giữ compatibility với Laravel + React hiện tại.
10. Không phụ thuộc Anthropic API trong Fake Mode.
11. Không expose API keys.
12. Sau mỗi task phải chạy tests liên quan.

---

# 15. Important

File này là development checkpoint.

Thông tin trong đây mô tả trạng thái lần cuối đã biết.

Codex phải kiểm tra source code hiện tại để xác nhận trước khi sửa, vì project có thể đã thay đổi sau khi file này được cập nhật.
