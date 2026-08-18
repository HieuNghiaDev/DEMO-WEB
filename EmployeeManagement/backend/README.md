# THEMIS backend

Laravel 12 API cho đăng nhập, tổ chức, chấm công, work session, giao việc, audit bảo mật và báo cáo Excel. Xem [README gốc](../../README.md), [kiến trúc](../../docs/ARCHITECTURE.md), [API](../../docs/API.md) và [dữ liệu/vận hành](../../docs/DATA_MODEL.md).

## Thiết lập

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

Thiết lập `DB_*`, `APP_URL` và `FRONTEND_URL` phù hợp trong `.env`. Không commit `.env` hoặc khóa `APP_KEY`.

## Lệnh

| Lệnh | Mục đích |
| --- | --- |
| `php artisan serve` | Chạy HTTP server local. |
| `php artisan migrate --seed` | Áp schema và dữ liệu mẫu. |
| `php artisan test` / `composer test` | Chạy PHPUnit. |
| `composer dev` | Chạy nhóm server/queue/log/Vite theo script Laravel (khi cần). |

## API

Các endpoint nằm dưới `/api`. `POST /api/login` là route công khai; các route khác yêu cầu Sanctum bearer token. Chi tiết request/response và validation: [API.md](../../docs/API.md).

## Tài khoản manager local

Khi chạy `php artisan db:seed` ở môi trường `local`, hệ thống tạo tài khoản chỉ dành cho kiểm thử:

| Email | Mật khẩu | Quyền |
| --- | --- | --- |
| `manager@themis.local` | `Themis@123456` | `manager` |

Seeder này không chạy ở production. Có thể tạo/cập nhật riêng bằng `php artisan db:seed --class=ManagerTestUserSeeder`.
