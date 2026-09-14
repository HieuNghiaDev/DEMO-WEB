<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google_drive' => [
        'enabled' => env('GOOGLE_DRIVE_ENABLED', false),
        'auth_mode' => env('GOOGLE_DRIVE_AUTH_MODE', 'service_account'),
        'file_id' => env('GOOGLE_DRIVE_FILE_ID'),
        'service_account_json' => env('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON'),
        'oauth_production_enabled' => env('GOOGLE_DRIVE_OAUTH_PRODUCTION_ENABLED', false),
        'oauth_client_json' => env('GOOGLE_DRIVE_OAUTH_CLIENT_JSON'),
        'oauth_client_json_path' => env('GOOGLE_DRIVE_OAUTH_CLIENT_JSON_PATH'),
        'oauth_token_json' => env('GOOGLE_DRIVE_OAUTH_TOKEN_JSON'),
        'oauth_token_path' => env('GOOGLE_DRIVE_OAUTH_TOKEN_PATH', 'google-drive/oauth-token.json'),
        'oauth_redirect_uri' => env('GOOGLE_DRIVE_OAUTH_REDIRECT_URI', 'http://localhost:8000/google-drive/oauth/callback'),
        'oauth_scope' => env('GOOGLE_DRIVE_OAUTH_SCOPE', 'https://www.googleapis.com/auth/drive'),
        'root_folder_id' => env('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
        'local_root_folder_id' => env('GOOGLE_DRIVE_LOCAL_ROOT_FOLDER_ID'),
        'write_enabled' => env('GOOGLE_DRIVE_WRITE_ENABLED', false),
        'write_scope' => env('GOOGLE_DRIVE_WRITE_SCOPE', 'https://www.googleapis.com/auth/drive.file'),
        'generated_documents_folder_id' => env('GOOGLE_DRIVE_GENERATED_DOCUMENTS_FOLDER_ID'),
        'document_sources_folder_id' => env('GOOGLE_DRIVE_DOCUMENT_SOURCES_FOLDER_ID'),
        'visa_progress_sheet' => env('GOOGLE_DRIVE_VISA_PROGRESS_SHEET'),
        'visa_progress_cache_seconds' => env('GOOGLE_DRIVE_CACHE_SECONDS', 60),
    ],

];
