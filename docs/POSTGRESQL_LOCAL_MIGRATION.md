# Chuyển local MySQL sang PostgreSQL

Phạm vi tài liệu này là môi trường local THEMIS duy nhất. Không áp dụng cho Railway, Supabase hoặc production.

## Trạng thái local

Ngày 2026-09-03, dữ liệu từ MySQL `employee_management` đã được copy sang PostgreSQL `Themis`. MySQL được giữ nguyên làm backup; Laravel local dùng `DB_CONNECTION=pgsql`.

- Backup nguồn: `EmployeeManagement/backend/database/backups/mysql_before_postgresql_20260903_133537.sql`.
- Snapshot số bản ghi nguồn: `EmployeeManagement/backend/database/backups/mysql_record_counts_20260903_133537.tsv`.
- Tất cả 49 bảng đã đối chiếu khớp số bản ghi.
- PostgreSQL sequences đã được đặt lại theo ID lớn nhất sau import.

Không lưu PostgreSQL password trong repository. Local PHP/libpq dùng file `pgpass.conf` của người dùng.

## Công cụ kiểm tra/copy

`EmployeeManagement/backend/database/tools/import_mysql_to_postgres.php` chỉ dùng cho MySQL local hiện có làm nguồn và PostgreSQL local `Themis` làm đích.

```powershell
$env:PGPASSFILE = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
php database/tools/import_mysql_to_postgres.php --verify
```

`--verify` chỉ đọc và so sánh schema, số bản ghi và sequence. `--execute` chỉ được dùng khi PostgreSQL đã tạo bằng migrations, không chứa dữ liệu nghiệp vụ và đã có backup MySQL xác minh. Script không chứa hay chạy `DROP`, `TRUNCATE`, `DELETE` hoặc bất kỳ ghi nào lên MySQL; mọi data import vào PostgreSQL nằm trong một transaction để rollback nếu có lỗi.

## Tương thích migration

Migrations chủ yếu dùng Laravel Schema Builder. Fluent `after()` chỉ quyết định thứ tự cột trên MySQL; PostgreSQL bỏ qua thứ tự này nhưng giữ cùng tên/cột/dữ liệu.

Hai bảng legacy `matters` và `tasks` không tồn tại trong schema MySQL nguồn, mặc dù lịch sử migration còn ghi nhận. Khi bootstrap PostgreSQL, hai migration tạo bảng này được bỏ qua để schema đích khớp nguồn mà không cần `DROP TABLE`. Marker migration `2026_08_31_120000_remove_legacy_matter_tasks` giữ lịch sử migration đồng nhất giữa hai database và không thực hiện thao tác phá hủy.

Không xóa MySQL hay backup cho đến khi người vận hành xác nhận bằng văn bản.
