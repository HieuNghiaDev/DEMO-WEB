# THEMIS frontend

React 19 + TypeScript + Vite cho giao diện quản lý nhân viên. Tài liệu tổng thể nằm ở [README gốc](../../README.md), [kiến trúc](../../docs/ARCHITECTURE.md) và [API](../../docs/API.md).

## Chạy

```powershell
npm ci
npm run dev
```

Frontend mặc định gọi `http://localhost:8000/api`. Có thể cấu hình bằng:

```env
VITE_BACKEND_URL=http://localhost:8000
# hoặc URL API đầy đủ:
VITE_API_URL=http://localhost:8000/api
```

## Lệnh

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Vite dev server. |
| `npm run build` | Type-check bằng `tsc -b` rồi build production. |
| `npm run lint` | Chạy ESLint toàn bộ mã frontend. |
| `npm run preview` | Phục vụ bundle đã build để kiểm tra. |

Build production dùng base path `/DEMO-WEB/`, được cấu hình trong `vite.config.ts`.
