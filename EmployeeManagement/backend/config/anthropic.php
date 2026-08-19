<?php

return [
    'api_key' => env('ANTHROPIC_API_KEY'),
    'model' => env('ANTHROPIC_MODEL'),
    'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
    'version' => env('ANTHROPIC_VERSION', '2023-06-01'),
    'max_tokens' => (int) env('ANTHROPIC_MAX_TOKENS', 1024),
];
