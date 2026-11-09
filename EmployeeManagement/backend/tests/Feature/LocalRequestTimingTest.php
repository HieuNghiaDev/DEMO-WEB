<?php

namespace Tests\Feature;

use App\Http\Middleware\LocalRequestTiming;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\Support\B21\B21TestCase;

class LocalRequestTimingTest extends B21TestCase
{
    protected function setUp(): void
    {
        parent::setUp(); // SQLite RAM preflight precedes every fixture write.
        file_put_contents(storage_path('logs/local-request-timing.log'), '');
    }

    private function request(): Request
    {
        $request = Request::create('/api/synthetic/private-record?email=synthetic@example.test', 'POST', ['password' => 'Synthetic-Secret!']);
        $request->headers->set('Authorization', 'Bearer synthetic-secret');
        $request->headers->set('X-Request-ID', 'synthetic-client-controlled');
        $route = new Route('POST', 'api/synthetic/{record}', fn () => null);
        $request->setRouteResolver(fn () => $route);
        return $request;
    }

    private function assertRecord(string $category): void
    {
        $lines = file(storage_path('logs/local-request-timing.log'), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $this->assertCount(1, $lines);
        preg_match('/local\.request_timing (\{.*\}) \[\]$/', $lines[0], $match);
        $context = json_decode($match[1], true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(['request_id', 'route', 'method', 'duration_ms', 'error_category'], array_keys($context));
        $this->assertMatchesRegularExpression('/^[a-f0-9-]{36}$/', $context['request_id']);
        $this->assertSame('api/synthetic/{record}', $context['route']);
        $this->assertSame('POST', $context['method']);
        $this->assertGreaterThanOrEqual(0, $context['duration_ms']);
        $this->assertSame($category, $context['error_category']);
        $encoded = json_encode($context);
        foreach (['synthetic@example.test', 'Synthetic-Secret!', 'synthetic-secret', 'private-record', 'synthetic-client-controlled'] as $private) {
            $this->assertStringNotContainsString($private, $encoded);
        }
    }

    public function test_error_record_is_allowlisted_and_does_not_change_response(): void
    {
        Log::shareContext(['synthetic_shared_secret' => 'synthetic-secret']);
        $response = (new LocalRequestTiming)->handle($this->request(), fn () => response()->json(['message' => 'Synthetic error'], 500));
        $this->assertRecord('http_5xx');
        $this->assertSame(500, $response->getStatusCode());
        $this->assertNotSame('synthetic-client-controlled', $response->headers->get('X-Request-ID'));
    }

    public function test_fatal_timeout_classification_is_safe_and_recorded_once(): void
    {
        (new LocalRequestTiming)->handle($this->request(), function () {
            LocalRequestTiming::reportFatal(['type' => E_ERROR, 'message' => 'Maximum execution time of 60 seconds exceeded synthetic-secret']);
            LocalRequestTiming::reportFatal(['type' => E_ERROR, 'message' => 'Maximum execution time of 60 seconds exceeded']);
            return response()->json([], 500);
        });
        // The shutdown frame is gone after completion; no stale request re-log.
        LocalRequestTiming::reportFatal(['type' => E_ERROR, 'message' => 'Maximum execution time of 60 seconds exceeded']);
        $this->assertRecord('execution_timeout');
    }

    public function test_exception_is_rethrown_unchanged(): void
    {
        $expected = new \RuntimeException('synthetic-secret');
        try {
            (new LocalRequestTiming)->handle($this->request(), fn () => throw $expected);
            $this->fail('Original exception must not be swallowed');
        } catch (\RuntimeException $actual) {
            $this->assertSame($expected, $actual);
        }
        $this->assertRecord('exception');
    }

    public function test_fast_requests_and_production_are_not_logged(): void
    {
        $response = (new LocalRequestTiming)->handle($this->request(), fn () => response()->json(['ok' => true]));
        $this->assertNotNull($response->headers->get('X-Request-ID'));
        $this->app['env'] = 'production'; // Synthetic app only, not environment files.
        $response = (new LocalRequestTiming)->handle($this->request(), fn () => response()->json([], 500));
        $this->assertNull($response->headers->get('X-Request-ID'));
        $this->assertSame('', file_get_contents(storage_path('logs/local-request-timing.log')));
    }

    public function test_logger_failure_cannot_change_an_authorization_denial(): void
    {
        $path = storage_path('logs/local-request-timing.log');
        unlink($path); // Only this test-created file in the runner's isolated storage.
        mkdir($path);
        try {
            $response = (new LocalRequestTiming)->handle($this->request(), fn () => response()->json(['denied' => true], 403));
            $this->assertSame(403, $response->getStatusCode());
        } finally {
            rmdir($path);
        }
    }

    public function test_synthetic_get_endpoints_are_profiled_without_query_text_or_private_data(): void
    {
        $actor = $this->fixtureUser('timing-reader', ['employee.view', 'case.view', 'task.view_own']);
        $this->actingAs($actor);
        $case = $this->matter($actor->employee);
        for ($i = 0; $i < 20; $i++) {
            $this->fixtureEmployee('timing-member-'.$i);
        }
        $queries = 0;
        DB::listen(function () use (&$queries) { $queries++; });
        foreach (['/api/me', '/api/organization', '/api/case-files', '/api/case-files/'.$case->id.'/workspace'] as $path) {
            $queries = 0;
            $started = hrtime(true);
            $response = $this->getJson($path)->assertOk();
            $record = ['request_id' => $response->headers->get('X-Request-ID'),
                'route' => preg_replace('/\d+/', '{caseFile}', $path), 'method' => 'GET',
                'duration_ms' => round((hrtime(true) - $started) / 1_000_000, 2), 'error_category' => 'none'];
            $this->assertGreaterThan(0, $queries);
            // RAM-only observations. No SQL, bindings, identities or response bodies.
            file_put_contents(storage_path('logs/synthetic-timing.jsonl'), json_encode($record)."\n", FILE_APPEND);
            file_put_contents(storage_path('logs/synthetic-query-counts.jsonl'), json_encode(['route' => $record['route'], 'queries' => $queries])."\n", FILE_APPEND);
        }
    }
}
