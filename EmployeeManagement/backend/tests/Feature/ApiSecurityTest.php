<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_responses_include_security_headers(): void
    {
        $this->getJson('/api/me')
            ->assertUnauthorized()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader(
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            )
            ->assertHeader(
                'Permissions-Policy',
                'camera=(), microphone=(), geolocation=()'
            )
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY');

        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'auth.request.unauthenticated',
            'outcome' => 'failure',
        ]);
    }

    public function test_repeated_denied_requests_are_deduplicated(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
        $this->getJson('/api/me')->assertUnauthorized();
        $this->getJson('/api/me')->assertUnauthorized();

        $this->assertDatabaseCount('security_audit_logs', 1);
    }

    public function test_cors_allows_the_known_frontend_origin(): void
    {
        $this->call('OPTIONS', '/api/login', server: [
            'HTTP_ORIGIN' => 'https://hieunghiadev.github.io',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'Authorization, Content-Type',
        ])
            ->assertNoContent()
            ->assertHeader(
                'Access-Control-Allow-Origin',
                'https://hieunghiadev.github.io'
            )
            ->assertHeader('Access-Control-Max-Age', '600');
    }

    public function test_cors_rejects_an_unknown_origin(): void
    {
        $this->call('OPTIONS', '/api/login', server: [
            'HTTP_ORIGIN' => 'https://attacker.example',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ])
            ->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    public function test_authenticated_api_requests_are_rate_limited(): void
    {
        Sanctum::actingAs(User::factory()->create());

        for ($requestNumber = 1; $requestNumber <= 60; $requestNumber++) {
            $this->getJson('/api/me')->assertOk();
        }

        $this->getJson('/api/me')->assertTooManyRequests();

        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'security.rate_limit.exceeded',
            'outcome' => 'failure',
            'user_id' => auth()->id(),
        ]);
    }
}
