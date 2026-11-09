<?php

return [
    'provider' => env('CHAT_TRANSLATION_PROVIDER', 'pending'),
    'gemini_key' => env('CHAT_TRANSLATION_GEMINI_KEY'),
    'gemini_model' => env('CHAT_TRANSLATION_GEMINI_MODEL', 'gemini-3.5-flash-lite'),
];
