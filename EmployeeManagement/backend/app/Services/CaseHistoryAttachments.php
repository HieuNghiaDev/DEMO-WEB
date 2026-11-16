<?php

namespace App\Services;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseFile;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

final class CaseHistoryAttachments
{
    private const MIB = 1024 * 1024;
    public const TOTAL_BYTES = 300 * self::MIB;
    private const MIMES = [
        'pdf' => ['application/pdf'],
        'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp'],
        'mp3' => ['audio/mpeg'], 'wav' => ['audio/wav', 'audio/x-wav', 'audio/vnd.wave'],
        'm4a' => ['audio/mp4', 'audio/x-m4a', 'video/mp4'], 'aac' => ['audio/aac', 'audio/x-hx-aac-adts'],
        'ogg' => ['audio/ogg', 'application/ogg'], 'opus' => ['audio/ogg', 'application/ogg'],
        'mp4' => ['video/mp4'], 'mov' => ['video/quicktime'], 'webm' => ['video/webm', 'audio/webm'],
    ];

    public function __construct(
        private readonly GoogleDriveService $drive,
        private readonly GoogleDriveProvisioningService $folders,
        private readonly CaseHistoryUploadStaging $staging,
    ) {}

    public static function supports(CaseFile $case): bool
    {
        // Restricted cases must not inherit access from the normal case Drive hierarchy.
        return ! array_key_exists('is_confidential', $case->getAttributes()) || $case->is_confidential === false;
    }

    public static function maxBytes(string $name): int
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (! isset(self::MIMES[$extension])) return 0;

        return self::MIB * match ($extension) {
            'mp4', 'mov', 'webm' => 250,
            'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus' => 100,
            default => 20,
        };
    }

    /** Upload first, then publish the history row and its audit together. */
    public function save(Request $request, CaseFile $case, callable $write, ?int $communicationId = null): mixed
    {
        $input = $request->validate([
            'attachments' => ['sometimes', 'array', 'list', 'max:5'],
            'attachments.*' => ['required', 'file', 'max:20480'],
            'staged_attachment_ids' => ['sometimes', 'array', 'list', 'max:5'],
            'staged_attachment_ids.*' => ['required', 'string', 'uuid', 'distinct:ignore_case'],
        ]);
        $inline = array_map(static fn (UploadedFile $file) => [
            'path' => $file->getPathname(), 'name' => $file->getClientOriginalName(), 'size' => (int) $file->getSize(),
        ], $input['attachments'] ?? []);
        $stagedIds = $input['staged_attachment_ids'] ?? [];
        if (! $inline && ! $stagedIds) {
            return DB::transaction(fn () => $write([]));
        }
        abort_unless(self::supports($case), 403, '機密案件ではこの保存先に添付できません。');
        if (count($inline) + count($stagedIds) > 5 || array_sum(array_column($inline, 'size')) > 32 * self::MIB) {
            throw ValidationException::withMessages(['attachments' => '添付ファイルの件数または合計サイズを確認してください。']);
        }
        if ($stagedIds) {
            return $this->staging->consume($case, $request->user(), $communicationId, $stagedIds,
                fn (array $staged) => $this->saveFiles($request, $case, [...$inline, ...$staged], $write));
        }

        return $this->saveFiles($request, $case, $inline, $write);
    }

    private function saveFiles(Request $request, CaseFile $case, array $files, callable $write): mixed
    {
        if (array_sum(array_column($files, 'size')) > self::TOTAL_BYTES) {
            throw ValidationException::withMessages(['attachments' => '添付ファイルの合計は300MB以下にしてください。']);
        }
        $validated = [];
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        foreach ($files as $index => ['path' => $path, 'name' => $originalName, 'size' => $size]) {
            $mime = $finfo->file($path);
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            if ($size < 1 || $size > self::maxBytes($originalName) || ! in_array($mime, self::MIMES[$extension] ?? [], true)) {
                throw ValidationException::withMessages(["attachments.$index" => '対応しているPDF・画像・音声・動画を選択してください。']);
            }
            $name = preg_replace('/[\\\\\/:*?"<>|\p{C}]+/u', '_', $originalName) ?? '';
            $name = trim($name, ' .');
            $filename = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 180) ?: 'attachment';
            $validated[] = ['path' => $path, 'name' => $filename.'.'.$extension, 'mime_type' => $mime, 'size' => $size];
        }

        $uploaded = [];
        try {
            $folderId = $this->folders->provisionHistoryAttachments($case)->external_folder_id;
            $this->drive->assertHistoryAttachmentFolder($folderId);
            foreach ($validated as ['path' => $path, 'name' => $name, 'mime_type' => $mime, 'size' => $size]) {
                $stream = fopen($path, 'rb');
                if ($stream === false) {
                    throw new GeneratedDocumentDriveException();
                }
                try {
                    $driveId = $this->drive->storeHistoryAttachment($stream, $name, $mime, $size, $folderId);
                } finally {
                    if (is_resource($stream)) {
                        fclose($stream);
                    }
                }
                $uploaded[] = ['id' => (string) Str::uuid(), 'name' => $name, 'mime_type' => $mime, 'size' => $size, 'drive_id' => $driveId];
            }
        } catch (Throwable) {
            $this->discard($uploaded);
            abort(503, '添付ファイルをGoogle Driveに保存できませんでした。時間をおいて再試行してください。');
        }

        $readyToCommit = false;
        try {
            return DB::transaction(function () use ($request, $case, $write, $uploaded, &$readyToCommit) {
                $currentCase = CaseFile::query()->whereKey($case->id)->lockForUpdate()->firstOrFail();
                Gate::forUser($request->user())->authorize('operate', $currentCase);
                abort_unless(self::supports($currentCase), 403);
                $result = $write($uploaded);
                $readyToCommit = true;

                return $result;
            });
        } catch (Throwable $error) {
            // Keep the files if the database may already have committed their references.
            if (! $readyToCommit) {
                $this->discard($uploaded);
            }
            throw $error;
        }
    }

    public function download(array $attachment): StreamedResponse
    {
        try {
            $stream = $this->drive->historyAttachmentStream($attachment['drive_id']);
        } catch (GeneratedDocumentDriveException) {
            abort(503, '添付ファイルをGoogle Driveから取得できませんでした。');
        }

        return response()->streamDownload(static function () use ($stream): void {
            try {
                while (! $stream->eof()) {
                    echo $stream->read(64 * 1024);
                }
            } finally {
                $stream->close();
            }
        }, $attachment['name'], [
            'Content-Type' => $attachment['mime_type'],
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function discard(array $uploaded): void
    {
        foreach ($uploaded as $attachment) {
            if (! $this->drive->deleteFile($attachment['drive_id'])) {
                logger()->warning('Unpublished history attachment cleanup failed.', ['attachment_id' => $attachment['id']]);
            }
        }
    }
}
