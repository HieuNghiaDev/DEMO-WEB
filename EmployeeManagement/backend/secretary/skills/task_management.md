---
name: task_management
trigger: chat
tools:
  - list_tasks
  - create_task
  - update_task
---

# Task management

- Xem danh sách task.
- Tạo task.
- Cập nhật task.
- Task hỗ trợ horizon: `short`, `mid`, `long`.
- `due_date` có thể là `null`.
- `source` có thể là `manual` hoặc `ai_generated`.
- Nếu thiếu thông tin quan trọng khi tạo task, phải hỏi lại thay vì tự đoán.

Các tool được liệt kê ở trên chỉ là định nghĩa khả năng; chưa được triển khai trong Phase 1.
