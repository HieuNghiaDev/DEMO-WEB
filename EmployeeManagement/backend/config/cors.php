<?php

return [
    'paths' => [
        'api/*',
    ],

    'allowed_methods' => [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
    ],

    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://hieunghiadev.github.io',
    ]))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'Origin',
    ],

    'exposed_headers' => [
        'Content-Disposition',
    ],

    'max_age' => 600,

    'supports_credentials' => false,
];
