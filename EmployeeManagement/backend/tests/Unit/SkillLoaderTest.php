<?php

namespace Tests\Unit;

use App\Services\SkillLoader;
use RuntimeException;
use Tests\TestCase;

class SkillLoaderTest extends TestCase
{
    public function test_legacy_skills_are_disabled(): void
    {
        foreach (SkillLoader::DISABLED_SKILLS as $name) {
            try {
                app(SkillLoader::class)->load($name);
                $this->fail('Disabled skill was loaded');
            } catch (RuntimeException $exception) {
                $this->assertStringContainsString('temporarily unavailable', $exception->getMessage());
            }
        }
    }

    public function test_it_reports_a_missing_skill(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Skill definition [missing] was not found.');

        app(SkillLoader::class)->load('missing');
    }
}
