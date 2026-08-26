<?php

return [
    'api_key' => env('GROQ_API_KEY'),
    'model' => env('GROQ_MODEL'),
    'base_url' => env('GROQ_BASE_URL', 'https://api.groq.com/openai'),
    'max_output_tokens' => (int) env('GROQ_MAX_OUTPUT_TOKENS', 2048),
    'reasoning_effort' => env('GROQ_REASONING_EFFORT', 'low'),
    'retry_attempts' => (int) env('GROQ_RETRY_ATTEMPTS', 1),
    'retry_delay_ms' => (int) env('GROQ_RETRY_DELAY_MS', 300),
    'connect_timeout_seconds' => (int) env('GROQ_CONNECT_TIMEOUT_SECONDS', 3),
    'timeout_seconds' => (int) env('GROQ_TIMEOUT_SECONDS', 8),
];
