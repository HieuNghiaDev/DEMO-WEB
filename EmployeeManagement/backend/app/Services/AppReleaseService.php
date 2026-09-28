<?php

namespace App\Services;

use App\Models\AppRelease;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class AppReleaseService
{
    /** @return array{release: AppRelease, previous_version: string} */
    public function createRelease(array $attributes, User $actor): array
    {
        return DB::transaction(function () use ($attributes, $actor): array {
            $current = AppRelease::query()
                ->where('status', 'released')
                ->orderByDesc('id')
                ->lockForUpdate()
                ->firstOrFail();

            $nextVersion = $this->nextVersion($current->version, $attributes['release_type']);
            [$major, $minor, $patch] = array_map('intval', explode('.', $nextVersion));

            $release = AppRelease::query()->create([
                'version' => $nextVersion,
                'major' => $major,
                'minor' => $minor,
                'patch' => $patch,
                'codename' => $current->codename,
                'release_type' => $attributes['release_type'],
                'title' => $attributes['title'],
                'release_notes' => $attributes['release_notes'],
                'released_at' => now(),
                'released_by' => $actor->id,
                'environment' => $current->environment,
                // Publishing metadata is not a deployment. Keep the active build
                // identity unless deployment configuration supplies a new one.
                'build_sha' => config('app.build_sha') ?: $current->build_sha,
                'build_number' => config('app.build_number') ?: $current->build_number,
                'build_date' => config('app.build_date') ?: $current->build_date?->toDateString(),
                'status' => 'released',
            ]);

            return [
                'release' => $release->load('releaser.employee:id,full_name'),
                'previous_version' => $current->version,
            ];
        }, 3);
    }

    public function nextVersion(string $currentVersion, string $releaseType): string
    {
        if (! preg_match('/^(\d+)\.(\d+)\.(\d+)$/', $currentVersion, $matches)) {
            throw new InvalidArgumentException('現在のバージョン形式が正しくありません。');
        }

        [$major, $minor, $patch] = array_map('intval', array_slice($matches, 1));

        return match ($releaseType) {
            'patch' => sprintf('%d.%d.%d', $major, $minor, $patch + 1),
            'minor' => sprintf('%d.%d.0', $major, $minor + 1),
            'major' => sprintf('%d.0.0', $major + 1),
            default => throw new InvalidArgumentException('リリース種別が正しくありません。'),
        };
    }
}
