<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

/** Owner-approved G3 allowlist. Client MIME/name never decides the detected content type or storage path. */
final class AllowedEvidenceFile implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $message = 'PDF・DOC/DOCX・XLS/XLSX・JPEG・PNG・WebP（20MB以下）のファイルを選択してください。その他の証拠形式は管理者へ確認してください。';
        if (! $value instanceof UploadedFile || ! $value->isValid() || $value->getSize() > 20 * 1024 * 1024) { $fail($message); return; }
        $extension = strtolower($value->getClientOriginalExtension());
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($value->getPathname());
        $allowed = [
            'pdf' => ['application/pdf'], 'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'],
            'png' => ['image/png'], 'webp' => ['image/webp'],
            'doc' => ['application/msword','application/x-ole-storage','application/CDFV2'],
            'xls' => ['application/vnd.ms-excel','application/x-ole-storage','application/CDFV2'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip'],
            'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'],
        ];
        if (! isset($allowed[$extension]) || ! in_array($mime, $allowed[$extension], true)) { $fail($message); return; }
        if (in_array($extension, ['docx','xlsx'], true)) {
            $zip = new \ZipArchive;
            if ($zip->open($value->getPathname()) !== true) { $fail($message); return; }
            try {
                $document = $extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
                if ($zip->locateName('[Content_Types].xml') === false || $zip->locateName($document) === false
                    || $zip->locateName('word/vbaProject.bin') !== false || $zip->locateName('xl/vbaProject.bin') !== false) $fail($message);
            } finally { $zip->close(); }
        }
    }
}
