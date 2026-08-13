<?php

return [
    // Railway and similar platforms sit behind a reverse proxy. Configure this
    // in production so Laravel can correctly detect HTTPS requests.
    'proxies' => env('TRUSTED_PROXIES'),
];
