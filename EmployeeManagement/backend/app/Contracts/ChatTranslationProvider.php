<?php

namespace App\Contracts;

interface ChatTranslationProvider
{
    /**
     * @return array{
     *   japanese_content:?string,
     *   vietnamese_content:?string,
     *   status:string,
     *   error_category:?string,
     *   provider:string,
     *   provider_metadata:array<string, scalar|null>
     * }
     */
    public function translate(string $originalText, string $sourceLanguage): array;
}
