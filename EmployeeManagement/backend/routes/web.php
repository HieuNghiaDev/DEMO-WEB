<?php

use App\Http\Controllers\GoogleDriveOAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/google-drive/oauth/authorize', [GoogleDriveOAuthController::class, 'authorize'])
    ->name('google-drive.oauth.authorize');
Route::get('/google-drive/oauth/callback', [GoogleDriveOAuthController::class, 'callback'])
    ->name('google-drive.oauth.callback');
