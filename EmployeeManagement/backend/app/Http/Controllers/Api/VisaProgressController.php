<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\VisaProgressConfigurationException;
use App\Exceptions\VisaProgressSourceException;
use App\Exceptions\VisaProgressWorkbookException;
use App\Exceptions\VisaProgressWorkbookNotFoundException;
use App\Http\Controllers\Controller;
use App\Services\GoogleDriveService;
use App\Services\VisaProgressSpreadsheetService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class VisaProgressController extends Controller
{
    public function __construct(
        private readonly GoogleDriveService $googleDrive,
        private readonly VisaProgressSpreadsheetService $spreadsheet,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $cacheKey = 'visa_progress.dashboard';

        if ($request->boolean('refresh')) {
            Cache::forget($cacheKey);
        }

        try {
            $ttl = max(0, (int) config('services.google_drive.visa_progress_cache_seconds', 60));
            $dashboard = $ttl > 0
                ? Cache::remember($cacheKey, now()->addSeconds($ttl), fn (): array => $this->loadDashboard())
                : $this->loadDashboard();

            return response()->json(['data' => $dashboard]);
        } catch (VisaProgressConfigurationException) {
            return $this->error(
                'Google Driveとの接続設定が完了していません。管理者に確認してください。',
                'google_drive_not_configured',
                503,
            );
        } catch (VisaProgressWorkbookNotFoundException) {
            Log::warning('Visa progress workbook could not be found.');

            return $this->error(
                '在留申請進捗管理ファイルを取得できませんでした。',
                'visa_progress_workbook_not_found',
                404,
            );
        } catch (VisaProgressSourceException) {
            Log::warning('Visa progress source could not be retrieved.');

            return $this->error(
                '在留申請進捗管理ファイルを取得できませんでした。',
                'visa_progress_source_unavailable',
                502,
            );
        } catch (VisaProgressWorkbookException) {
            Log::warning('Visa progress workbook could not be parsed.');

            return $this->error(
                'Excelファイルの形式を確認できませんでした。',
                'visa_progress_workbook_invalid',
                422,
            );
        } catch (\Throwable) {
            Log::error('Visa progress dashboard could not be loaded.');

            return $this->error(
                '在留申請データを取得できませんでした。しばらくしてから再試行してください。',
                'visa_progress_unavailable',
                500,
            );
        }
    }

    /** @return array<string, mixed> */
    private function loadDashboard(): array
    {
        $download = $this->googleDrive->downloadConfiguredWorkbook();

        try {
            $parsed = $this->spreadsheet->parse($download['path']);

            return [
                'source' => [
                    'name' => $download['metadata']['name'],
                    'modified_at' => $this->normalizeSourceDate($download['metadata']['modified_at']),
                    'synced_at' => now()->toIso8601String(),
                    'sheet_name' => $parsed['source_sheet'],
                ],
                'summary' => $this->spreadsheet->buildSummary($parsed['applications']),
                'applications' => $parsed['applications'],
            ];
        } finally {
            $this->googleDrive->deleteDownload($download);
        }
    }

    private function normalizeSourceDate(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        try {
            return Carbon::parse($value)->toIso8601String();
        } catch (\Throwable) {
            return null;
        }
    }

    private function error(string $message, string $code, int $status): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'code' => $code,
        ], $status);
    }
}
