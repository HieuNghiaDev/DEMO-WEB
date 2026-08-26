<?php

namespace App\Providers;

use App\Contracts\AIModelClient;
use App\Services\ClaudeClient;
use App\Services\FailoverAIModelClient;
use App\Services\GeminiClient;
use App\Services\GroqClient;
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
            $clients = [
                'claude' => fn (): AIModelClient => $app->make(ClaudeClient::class),
                'gemini' => fn (): AIModelClient => $app->make(GeminiClient::class),
                'groq' => fn (): AIModelClient => $app->make(GroqClient::class),
            ];
            $primaryName = strtolower(trim((string) config('ai.provider')));
            $fallbackName = strtolower(trim((string) config('ai.fallback_provider')));

            if (! isset($clients[$primaryName])) {
                throw new LogicException('AI_PROVIDER must be "claude", "gemini", or "groq".');
            }

            $primary = $clients[$primaryName]();

            if ($fallbackName === '' || $fallbackName === $primaryName) {
                return $primary;
            }

            if (! isset($clients[$fallbackName])) {
                throw new LogicException('AI_FALLBACK_PROVIDER must be "claude", "gemini", or "groq".');
            }

            return new FailoverAIModelClient(
                primary: $primary,
                fallback: $clients[$fallbackName](),
                primaryName: $primaryName,
                fallbackName: $fallbackName,
            );
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
