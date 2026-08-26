<?php

return [
    'api_key' => env('GEMINI_API_KEY', env('GOOGLE_API_KEY')),
    'model' => env('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    'fallback_model' => env('GEMINI_FALLBACK_MODEL', 'gemini-3.6-flash'),
    'base_url' => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'),
    'max_output_tokens' => (int) env('GEMINI_MAX_OUTPUT_TOKENS', 1024),
    'retry_attempts' => (int) env('GEMINI_RETRY_ATTEMPTS', 2),
    'retry_delay_ms' => (int) env('GEMINI_RETRY_DELAY_MS', 400),
    'connect_timeout_seconds' => (int) env('GEMINI_CONNECT_TIMEOUT_SECONDS', 3),
    'timeout_seconds' => (int) env('GEMINI_TIMEOUT_SECONDS', 8),
    'max_concurrent_requests' => (int) env('GEMINI_MAX_CONCURRENT_REQUESTS', 2),
    'concurrency_wait_ms' => (int) env('GEMINI_CONCURRENCY_WAIT_MS', 8000),
];
