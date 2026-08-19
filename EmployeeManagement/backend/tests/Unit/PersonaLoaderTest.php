<?php

namespace Tests\Unit;

use App\Services\PersonaLoader;
use RuntimeException;
use Tests\TestCase;

class PersonaLoaderTest extends TestCase
{
    public function test_it_loads_secretary(): void
    {
        $persona = app(PersonaLoader::class)->load('secretary');

        $this->assertSame('secretary', $persona['name']);
        $this->assertSame('AI 秘書', $persona['display_name']);
        $this->assertSame(['task_management', 'morning_briefing'], $persona['skills']);
        $this->assertStringContainsString('AI Thư ký', $persona['instructions']);
    }

    public function test_it_reports_a_missing_persona(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Persona definition [missing] was not found.');

        app(PersonaLoader::class)->load('missing');
    }
}
