---
name: morning_briefing
trigger: cron
schedule: "0 8 * * 1-5"
tools:
  - list_tasks
---

# Morning briefing

- Lấy các task gần deadline.
- Ưu tiên task có `horizon=short`.
- Tóm tắt ngắn gọn bằng tiếng Nhật.
- Khi thông tin không chắc chắn, phải ghi `要確認`.

Trong Phase 1, Morning Briefing chỉ dựa trên task. Gmail và Google Calendar không thuộc skill này.
