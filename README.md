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

1. Thiết lập backend:

   ```powershell
   Set-Location EmployeeManagement/backend
   composer install
   Copy-Item .env.example .env
   php artisan key:generate
   php artisan migrate --seed
   php artisan serve
   ```

2. Trong một terminal khác, chạy frontend:

   ```powershell
   Set-Location EmployeeManagement/frontend
   npm ci
   npm run dev
   ```

3. Mở địa chỉ Vite (mặc định `http://localhost:5173`). Backend mặc định ở `http://localhost:8000`.

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
