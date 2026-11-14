<?php

namespace App\Services;

use App\Models\CaseFile;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/** Private scratch files used to keep each HTTP upload below the server body limit. */
final class CaseHistoryUploadStaging
{
    private const ROOT = 'case-history-uploads';
    public const CHUNK_KIB = 4096;

    public function start(CaseFile $case, User $user, ?int $communicationId, string $name, int $size): string
    {
        $max = CaseHistoryAttachments::maxBytes($name);
        if (! $max || $size > $max) {
            throw ValidationException::withMessages(['attachments' => 'ファイル形式またはサイズを確認してください。']);
        }
        abort_unless(CaseHistoryAttachments::supports($case), 403, '機密案件ではこの保存先に添付できません。');
        abort_unless(app(GoogleDriveService::class)->canWriteHistoryAttachments(), 503, '添付ファイルの保存先が設定されていません。');

        $owner = self::ROOT.'/'.$user->id;
        $lock = Cache::lock('case-history-upload-owner:'.$user->id, 30);
        abort_unless($lock->get(), 409);
        try {
            $disk = Storage::disk('local');
            $reserved = 0;
            $active = 0;
            foreach ($disk->directories($owner) as $path) {
                $state = $this->state($path);
                if ($state && $state['expires_at'] > now()->timestamp) {
                    $reserved += $state['size'];
                    $active++;
                } else {
                    $this->purgeDirectory($path);
                }
            }
            abort_if($active >= 10 || $reserved + $size > 2 * CaseHistoryAttachments::TOTAL_BYTES, 429, '保留中の添付ファイルが多すぎます。');

            $id = (string) Str::uuid();
            $path = "$owner/$id";
            $state = ['case_id' => $case->id, 'communication_id' => $communicationId, 'name' => $name,
                'size' => $size, 'expires_at' => now()->addHours(2)->timestamp];
            abort_unless($disk->put("$path/state.json", json_encode($state, JSON_THROW_ON_ERROR)), 503);

            return $id;
        } finally {
            $lock->release();
        }
    }

    public function append(CaseFile $case, User $user, string $id, int $offset, UploadedFile $chunk): int
    {
        abort_unless(CaseHistoryAttachments::supports($case), 403);

        return $this->withLock($id, function () use ($case, $user, $id, $offset, $chunk): int {
            $path = $this->path($user, $id);
            $state = $this->ownedState($path, $case);
            $target = Storage::disk('local')->path("$path/content");
            clearstatcache(true, $target);
            $current = is_file($target) ? filesize($target) : 0;
            abort_if($offset !== $current, 409, '添付ファイルの送信順序が一致しません。');
            $size = $chunk->getSize();
            abort_if(! $size || $offset + $size > $state['size'], 422, '添付ファイルのサイズが一致しません。');

            $input = fopen($chunk->getPathname(), 'rb');
            $output = fopen($target, 'c+b');
            try {
                abort_unless($input && $output && fseek($output, $offset) === 0, 503);
                if (stream_copy_to_stream($input, $output, $size) !== $size || ! fflush($output)) {
                    ftruncate($output, $offset);
                    abort(503, '添付ファイルを一時保存できませんでした。');
                }
            } finally {
                if (is_resource($input)) fclose($input);
                if (is_resource($output)) fclose($output);
            }

            return $offset + $size;
        });
    }

    public function discard(CaseFile $case, User $user, string $id): void
    {
        $this->withLock($id, function () use ($case, $user, $id): void {
            $path = $this->path($user, $id);
            $this->ownedState($path, $case);
            Storage::disk('local')->deleteDirectory($path);
        });
    }

    /** @param list<string> $ids */
    public function consume(CaseFile $case, User $user, ?int $communicationId, array $ids, callable $save): mixed
    {
        $locks = [];
        $claimed = [];
        $disk = Storage::disk('local');
        try {
            $files = [];
            foreach ($ids as $id) {
                $lock = Cache::lock('case-history-upload:'.$id, 900);
                abort_unless($lock->get(), 409, '添付ファイルは処理中です。');
                $locks[] = $lock;
                $path = $this->path($user, $id);
                $state = $this->ownedState($path, $case);
                $content = $disk->path("$path/content");
                clearstatcache(true, $content);
                if ($state['communication_id'] !== $communicationId || ! is_file($content) || filesize($content) !== $state['size']) {
                    throw ValidationException::withMessages(['attachments' => '添付ファイルの送信を完了してから保存してください。']);
                }
                $files[] = ['path' => $content, 'name' => $state['name'], 'size' => $state['size']];
            }
            // A claimed ID remains unavailable even if scratch cleanup fails after the DB commit.
            foreach ($ids as $id) {
                $path = $this->path($user, $id);
                abort_unless($disk->put("$path/claimed", '1'), 503, '添付ファイルの保存を開始できませんでした。');
                $claimed[$id] = $path;
            }

            return $save($files);
        } finally {
            foreach ($claimed as $id => $path) {
                try {
                    if ($disk->delete("$path/content") && $disk->deleteDirectory($path)) continue;
                } catch (Throwable) {
                    // Leave the claim for timed cleanup.
                }
                logger()->warning('History upload scratch cleanup deferred.', ['upload_id' => $id]);
            }
            foreach ($locks as $lock) $lock->release();
        }
    }

    public function purgeExpired(): void
    {
        $disk = Storage::disk('local');
        foreach ($disk->directories(self::ROOT) as $owner) {
            foreach ($disk->directories($owner) as $path) $this->purgeDirectory($path);
        }
    }

    private function purgeDirectory(string $path): void
    {
        $id = basename($path);
        if (! Str::isUuid($id)) return;
        $lock = Cache::lock('case-history-upload:'.$id, 30);
        if (! $lock->get()) return;
        try {
            $state = $this->state($path);
            if (($state['expires_at'] ?? PHP_INT_MAX) <= now()->timestamp) {
                Storage::disk('local')->deleteDirectory($path);
            }
        } finally {
            $lock->release();
        }
    }

    private function state(string $path): ?array
    {
        $raw = Storage::disk('local')->get("$path/state.json");

        return is_string($raw) ? json_decode($raw, true) : null;
    }

    private function ownedState(string $path, CaseFile $case): array
    {
        $state = $this->state($path);
        abort_unless($state && $state['case_id'] === $case->id && $state['expires_at'] > now()->timestamp
            && ! Storage::disk('local')->exists("$path/claimed"), 404);

        return $state;
    }

    private function path(User $user, string $id): string
    {
        abort_unless(Str::isUuid($id), 404);

        return self::ROOT."/$user->id/$id";
    }

    private function withLock(string $id, callable $action): mixed
    {
        $lock = Cache::lock('case-history-upload:'.$id, 30);
        abort_unless($lock->get(), 409);
        try {
            return $action();
        } finally {
            $lock->release();
        }
    }
}
