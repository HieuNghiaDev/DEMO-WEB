# Google Drive setup — 在留申請進捗管理 (Phase 1)

Phase 1 chỉ đọc workbook Excel từ Google Drive. Frontend không nhận Google credential, không được truy cập Drive trực tiếp và ứng dụng không ghi lại file Excel.

## 1. Tạo Service Account với quyền tối thiểu

1. Trong Google Cloud, tạo một Service Account cho THEMIS.
2. Enable **Google Drive API** cho project đó.
3. Tạo JSON key cho Service Account và lưu nó trong secret manager / Railway Variables; không commit file JSON vào Git.
4. Chia sẻ đúng workbook Excel cho email của Service Account với quyền **Viewer**. Phase 1 không cần Editor.

Ví dụ email cần share:

```text
themis-visa-reader@your-project.iam.gserviceaccount.com
```

## 2. Lấy Google Drive file ID

Mở workbook trong Drive. File ID là phần giữa `/d/` và `/view` của URL. Không dùng filename làm định danh vì tên/version có thể thay đổi.

```text
https://drive.google.com/file/d/FILE_ID/view
```

## 3. Cấu hình Laravel

Thêm các biến sau vào môi trường backend (Railway Variables hoặc `.env` local):

```env
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_FILE_ID=FILE_ID
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=base64:BASE64_ENCODED_SERVICE_ACCOUNT_JSON
GOOGLE_DRIVE_VISA_PROGRESS_SHEET=
GOOGLE_DRIVE_CACHE_SECONDS=60
```

`GOOGLE_DRIVE_VISA_PROGRESS_SHEET` là tuỳ chọn. Để trống để parser tự tìm sheet có header dữ liệu; đặt tên sheet khi workbook có nhiều sheet tương tự.

Có thể đặt nguyên JSON vào `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, nhưng giá trị `base64:` thường an toàn hơn với môi trường deploy vì private key có xuống dòng. Base64 chỉ là định dạng truyền cấu hình, không phải mã hoá; vẫn phải lưu biến trong nơi quản lý secret.

PowerShell để tạo giá trị base64:

```powershell
$json = Get-Content .\service-account.json -Raw
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
```

Sau đó thêm tiền tố `base64:` trước giá trị vừa tạo.

## 4. Kiểm tra

Đăng nhập bằng user có permission `case.view`, mở `/visa-progress` và nhấn **最新データを取得**. Endpoint là:

```text
GET /api/visa-progress?refresh=1
```

Nếu chưa cấu hình, UI sẽ hiện thông báo có kiểm soát thay vì làm toàn bộ ứng dụng lỗi. Lỗi API không trả private key, token Google hay đường dẫn file tạm.

## Scope được dùng

Service Account chỉ yêu cầu:

```text
https://www.googleapis.com/auth/drive.readonly
```

Không có quyền ghi, upload, replace hoặc xóa file Google Drive trong Phase 1.
