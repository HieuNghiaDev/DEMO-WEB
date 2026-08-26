<?php

return [
    'provider' => env('AI_PROVIDER', 'claude'),
    'fallback_provider' => env('AI_FALLBACK_PROVIDER'),

    'orchestrator' => [
        'max_iterations' => env('AI_ORCHESTRATOR_MAX_ITERATIONS', 8),
    ],

];
