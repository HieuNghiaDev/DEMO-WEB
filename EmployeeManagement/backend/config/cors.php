<?php

return [
    'paths' => [
        'api/*',
    ],

    'allowed_methods' => [
        'GET',
        'POST',
        'PATCH',
        'OPTIONS',
    ],

    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL'),
        'http://localhost:5173',
        'https://hieunghiadev.github.io',
    ]))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'Origin',
    ],

    'exposed_headers' => [],

    'max_age' => 600,

    'supports_credentials' => false,
];
