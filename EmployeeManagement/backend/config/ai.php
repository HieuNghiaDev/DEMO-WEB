<?php

return [
    'orchestrator' => [
        'max_iterations' => env('AI_ORCHESTRATOR_MAX_ITERATIONS', 8),
    ],

    'fake_mode' => env('AI_FAKE_MODE', false),
];
