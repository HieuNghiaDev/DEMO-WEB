# THEMIS Employee Management

Ứng dụng web nội bộ để nhân viên chấm công, ghi nhận công việc, nhận việc được giao và xem sơ đồ tổ chức. Dự án gồm hai ứng dụng độc lập:

| Phần | Công nghệ | Thư mục | Vai trò |
| --- | --- | --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS | `EmployeeManagement/frontend` | Giao diện SPA, quản lý phiên đăng nhập và gọi REST API. |
| Backend | Laravel 12, PHP 8.2, Sanctum, PhpSpreadsheet | `EmployeeManagement/backend` | REST API, nghiệp vụ chấm công/công việc, phân quyền và xuất Excel. |

## Tài liệu

- [Kiến trúc và chỉ mục mã nguồn](docs/ARCHITECTURE.md)
- [API và nghiệp vụ](docs/API.md)
- [Mô hình dữ liệu, bảo mật và vận hành](docs/DATA_MODEL.md)

## Chạy tại máy

Yêu cầu: PHP 8.2+, Composer, Node.js 20+ và một cơ sở dữ liệu được Laravel hỗ trợ.

### Mở THEMIS local trên Windows

Bật MySQL trong XAMPP, rồi chạy lệnh sau từ thư mục gốc dự án:

```powershell
.\Start-ThemisLocal.ps1
```

Launcher dùng cấu hình local `employee_management` tại `127.0.0.1:3306`, mở Laravel và Vite, đồng thời khởi động worker `chat-translations` nếu Gemini đã được cấu hình. Chạy lại launcher sẽ dùng lại các tiến trình đang chạy. Mở [THEMIS](http://localhost:5173) sau khi launcher báo sẵn sàng. Log của tiến trình do launcher mở nằm trong `EmployeeManagement/backend/storage/logs`.

### Thiết lập lần đầu với cơ sở dữ liệu mới

1. Thiết lập backend:

   ```powershell
   Set-Location EmployeeManagement/backend
   composer install
   Copy-Item .env.example .env
   php artisan key:generate
   php artisan migrate --seed
   ```

2. Cài phụ thuộc frontend:

   ```powershell
   Set-Location EmployeeManagement/frontend
   npm ci
   ```

3. Quay lại thư mục gốc và chạy launcher ở trên. Backend mặc định ở `http://localhost:8000`.

Các tài khoản mẫu chỉ được seed ở môi trường `local/testing`; production không tạo tài khoản có mật khẩu mặc định. Nếu migration bảo mật vô hiệu hóa tài khoản seed cũ, đặt lại mật khẩu qua terminal backend bằng `php artisan themis:user-password <login_id> --activate`. Mật khẩu được nhập ẩn.

Các biến môi trường, lệnh kiểm tra và lưu ý triển khai nằm trong [tài liệu vận hành](docs/DATA_MODEL.md).

## Kiểm tra chất lượng

```powershell
Set-Location EmployeeManagement/frontend
npm run lint
npm run build

Set-Location ../backend
php artisan test
```

## Phạm vi tài liệu

Tài liệu mô tả toàn bộ mã nguồn tự viết: giao diện trong `src`, mã nghiệp vụ Laravel trong `app`, route, migration, seeder, test và cấu hình ứng dụng. Thư mục phụ thuộc/gia tạo (`node_modules`, `vendor`, build output, cache/storage runtime) và tệp khóa không được diễn giải theo từng tệp vì không phải mã bảo trì của dự án.
