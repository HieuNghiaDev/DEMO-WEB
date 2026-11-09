<?php

namespace App\Exceptions;

use RuntimeException;

class GeneratedDocumentDriveException extends RuntimeException
{
    public const PUBLIC_MESSAGE = '文書の保存・取得を完了できませんでした。しばらくしてから再試行してください。';

    /** Typed provider boundary: no exception message, previous exception, SQL or payload reaches clients/logs. */
    public function safeResponse(): \Illuminate\Http\JsonResponse
    {
        $id = (string) \Illuminate\Support\Str::uuid();
        \Illuminate\Support\Facades\Log::warning('Document provider operation failed.', [
            'request_id' => $id, 'error_category' => 'document_provider_unavailable',
        ]);
        return response()->json(['message' => self::PUBLIC_MESSAGE, 'code' => 'document_provider_unavailable', 'request_id' => $id], 503)
            ->header('Cache-Control', 'no-store, private');
    }
}
