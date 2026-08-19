<?php

namespace Tests\Unit;

use App\Services\SkillLoader;
use RuntimeException;
use Tests\TestCase;

class SkillLoaderTest extends TestCase
{
    public function test_it_loads_task_management(): void
    {
        $skill = app(SkillLoader::class)->load('task_management');

        $this->assertSame('task_management', $skill['name']);
        $this->assertSame('chat', $skill['trigger']);
        $this->assertSame(['list_tasks', 'create_task', 'update_task'], $skill['tools']);
        $this->assertStringContainsString('Tạo task', $skill['instructions']);
    }

    public function test_it_loads_morning_briefing(): void
    {
        $skill = app(SkillLoader::class)->load('morning_briefing');

        $this->assertSame('cron', $skill['trigger']);
        $this->assertSame('0 8 * * 1-5', $skill['schedule']);
        $this->assertSame(['list_tasks'], $skill['tools']);
    }

    public function test_it_reports_a_missing_skill(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Skill definition [missing] was not found.');

        app(SkillLoader::class)->load('missing');
    }
}
