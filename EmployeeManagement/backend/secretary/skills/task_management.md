---
name: task_management
trigger: chat
tools:
  - list_tasks
  - create_task
  - update_task
  - request_approval
---

# Task management

- Xem danh sách task.
- Tạo task.
- Cập nhật task.
- Khi người dùng yêu cầu xóa task, không được xóa trực tiếp. Phải dùng `request_approval` với `action_type=delete_task`, `tool_name=delete_task` và `payload.task_id`.
- Sau khi tạo approval, phải nói rõ yêu cầu đang chờ con người phê duyệt và task chưa bị xóa.
- Task hỗ trợ horizon: `short`, `mid`, `long`.
- `due_date` có thể là `null`.
- `source` có thể là `manual` hoặc `ai_generated`.
- Nếu thiếu thông tin quan trọng khi tạo task, phải hỏi lại thay vì tự đoán.

Các tool được liệt kê ở trên đã được triển khai và được thực thi thông qua AIOrchestrator cùng ToolRegistry.
