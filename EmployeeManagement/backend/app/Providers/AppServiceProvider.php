<?php

namespace App\Providers;

use App\Contracts\AIModelClient;
use App\Services\ClaudeClient;
use App\Services\FakeClaudeClient;
use Illuminate\Support\ServiceProvider;
use LogicException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(AIModelClient::class, function ($app): AIModelClient {
            $fakeMode = filter_var(config('ai.fake_mode'), FILTER_VALIDATE_BOOL);

            if ($fakeMode && $app->environment('production')) {
                throw new LogicException('AI_FAKE_MODE must not be enabled in production.');
            }

            return $fakeMode
                ? $app->make(FakeClaudeClient::class)
                : $app->make(ClaudeClient::class);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
