<?php

namespace App\Services;

use App\Contracts\ChatTranslationProvider;

final class PendingChatTranslationProvider implements ChatTranslationProvider
{
    public function translate(string $originalText, string $sourceLanguage): array
    {
        return [
            'japanese_content' => $sourceLanguage === 'ja' ? $originalText : null,
            'vietnamese_content' => $sourceLanguage === 'vi' ? $originalText : null,
            'status' => 'pending',
            'error_category' => null,
            'provider' => 'pending',
            'provider_metadata' => ['reason' => 'provider_not_approved'],
        ];
    }
}
