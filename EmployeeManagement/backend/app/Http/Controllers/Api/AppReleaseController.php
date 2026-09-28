<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppReleaseRequest;
use App\Models\AppRelease;
use App\Services\AppReleaseService;
use App\Services\SecurityAuditLogger;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppReleaseController extends Controller
{
    public function current(): JsonResponse
    {
        $release = AppRelease::query()
            ->where('status', 'released')
            ->latest('id')
            ->firstOrFail();

        return response()->json([
            'release' => $this->serializeRelease($release),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $releases = AppRelease::query()
            ->with('releaser.employee:id,full_name')
            ->where('status', 'released')
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 15), 1), 50));

        return response()->json([
            'releases' => $releases->through(fn (AppRelease $release) => $this->serializeRelease($release, true)),
        ]);
    }

    public function store(
        StoreAppReleaseRequest $request,
        AppReleaseService $releaseService,
        SecurityAuditLogger $auditLogger
    ): JsonResponse {
        try {
            $result = $releaseService->createRelease($request->validated(), $request->user());
        } catch (QueryException $exception) {
            if (in_array($exception->getCode(), ['23000', '23505'], true)) {
                return response()->json([
                    'message' => '同じバージョンのリリースが既に作成されています。最新情報を再取得してください。',
                ], 409);
            }

            throw $exception;
        }

        $release = $result['release'];
        $auditLogger->record(
            request: $request,
            event: 'app.release.created',
            outcome: 'success',
            metadata: [
                'previous_version' => $result['previous_version'],
                'new_version' => $release->version,
                'release_type' => $release->release_type,
                'released_by' => $request->user()->id,
            ]
        );

        return response()->json([
            'message' => "v{$release->version} をリリースしました。",
            'release' => $this->serializeRelease($release, true),
        ], 201);
    }

    private function serializeRelease(AppRelease $release, bool $includeDeveloperMetadata = false): array
    {
        $payload = [
            'id' => $release->id,
            'version' => $release->version,
            'codename' => $release->codename,
            'release_type' => $release->release_type,
            'title' => $release->title,
            'release_notes' => $release->release_notes,
            'released_at' => $release->released_at?->toIso8601String(),
            'environment' => $release->environment,
            'build_date' => $release->build_date?->toDateString(),
            'status' => $release->status,
        ];

        if ($includeDeveloperMetadata) {
            $payload['released_by'] = $release->releaser ? [
                'id' => $release->releaser->id,
                'name' => $release->releaser->employee?->full_name
                    ?? $release->releaser->name
                    ?? $release->releaser->login_id,
            ] : null;
            $payload['build_sha'] = $release->build_sha;
            $payload['build_number'] = $release->build_number;
        }

        return $payload;
    }
}
