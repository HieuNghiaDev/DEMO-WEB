<?php

namespace App\Providers;

use App\Contracts\AIModelClient;
use App\Contracts\C001WorkbookPdfConverter;
use App\Services\ClaudeClient;
use App\Services\FailoverAIModelClient;
use App\Services\GeminiClient;
use App\Services\GroqClient;
use App\Services\PhpSpreadsheetC001WorkbookPdfConverter;
use Illuminate\Support\ServiceProvider;
use LogicException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(\App\Contracts\ChatTranslationProvider::class, fn ($app) => $app->make(
            config('chat_translation.provider') === 'gemini'
                ? \App\Services\GeminiChatTranslationProvider::class
                : \App\Services\PendingChatTranslationProvider::class
        ));
        $this->app->bind(\App\Contracts\AdministrativeAuthentication::class, \App\Services\Administration\TotpAdministrativeAuthentication::class);
        $this->app->scoped(\App\Services\Administration\AdminContinuityGuard::class);
        $this->app->bind(C001WorkbookPdfConverter::class, PhpSpreadsheetC001WorkbookPdfConverter::class);
        $this->app->scoped(\App\Services\LocalC001Installation::class);
        $this->app->bind(\App\Contracts\C001AuthorityPolicy::class, \App\Services\PendingC001AuthorityPolicy::class);

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
        foreach (['mfa-enroll-start', 'mfa-enroll-confirm', 'mfa-login', 'mfa-step-up', 'mfa-codes', 'mfa-device', 'password-change', 'password-reset'] as $limiter) {
            \Illuminate\Support\Facades\RateLimiter::for($limiter, fn (\Illuminate\Http\Request $request) =>
                \Illuminate\Cache\RateLimiting\Limit::perMinute(5)->by($limiter.'|'.$request->ip().'|'.$request->user()?->id));
        }
        \Illuminate\Support\Facades\RateLimiter::for('internal-chat-send', fn (\Illuminate\Http\Request $request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(20)->by('internal-chat-send|'.$request->ip().'|'.$request->user()?->id));
        \Illuminate\Support\Facades\RateLimiter::for('email-change-send', fn (\Illuminate\Http\Request $request) => [
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('email-change-send|'.$request->user()?->id),
            \Illuminate\Cache\RateLimiting\Limit::perHour(5)->by('email-change-send-hour|'.$request->user()?->id),
        ]);
        \Illuminate\Support\Facades\RateLimiter::for('email-change-confirm', fn (\Illuminate\Http\Request $request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(5)->by('email-change-confirm|'.$request->user()?->id));
        \Illuminate\Support\Facades\Gate::policy(\App\Models\Employee::class, \App\Policies\EmployeePolicy::class);
        \Illuminate\Support\Facades\Gate::policy(\App\Models\Role::class, \App\Policies\RolePolicy::class);
        \Illuminate\Support\Facades\Gate::policy(\App\Models\CaseFile::class, \App\Policies\CaseFilePolicy::class);
        \Illuminate\Support\Facades\Gate::policy(\App\Models\InterpretationRequest::class, \App\Policies\InterpretationRequestPolicy::class);
    }
}
