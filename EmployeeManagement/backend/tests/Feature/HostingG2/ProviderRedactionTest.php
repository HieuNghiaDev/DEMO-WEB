<?php

namespace Tests\Feature\HostingG2;

use App\Exceptions\GeneratedDocumentDriveException;
use Illuminate\Support\Facades\Log;
use Tests\Support\B21\B21TestCase;

class ProviderRedactionTest extends B21TestCase
{
    public function test_provider_error_response_and_log_never_include_exception_payload(): void
    {
        $sentinel = 'SYNTHETIC_SECRET_SQL_PATH_PROVIDER_PAYLOAD';
        Log::shouldReceive('warning')->once()->withArgs(function ($message, $context) use ($sentinel): bool {
            $this->assertSame('Document provider operation failed.', $message);
            $this->assertSame(['request_id', 'error_category'], array_keys($context));
            $this->assertStringNotContainsString($sentinel, json_encode($context));
            return true;
        });
        $response = (new GeneratedDocumentDriveException($sentinel, 0, new \RuntimeException($sentinel)))->safeResponse();
        $this->assertSame(503, $response->getStatusCode());
        $this->assertSame(GeneratedDocumentDriveException::PUBLIC_MESSAGE, $response->getData(true)['message']);
        $this->assertSame('document_provider_unavailable', $response->getData(true)['code']);
        $this->assertMatchesRegularExpression('/^[a-f0-9-]{36}$/D', $response->getData(true)['request_id']);
        $this->assertStringNotContainsString($sentinel, $response->getContent());
    }
}
