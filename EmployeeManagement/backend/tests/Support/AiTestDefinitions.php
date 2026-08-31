<?php

namespace Tests\Support;

use App\AI\Tools\Tool;
use App\Services\PersonaLoader;
use App\Services\SkillLoader;
use App\Services\ToolRegistry;
use Mockery;
use RuntimeException;

trait AiTestDefinitions
{
    protected function setUpAiTestDefinitions(): void
    {
        // Exercise provider/orchestration infrastructure without re-enabling production legacy skills.
        $personas = Mockery::mock(PersonaLoader::class)->makePartial();
        $personas->shouldReceive('load')->with('secretary')->andReturn([
            'name' => 'secretary', 'display_name' => 'AI 秘書',
            'skills' => ['test_assistance', 'test_briefing'],
            'instructions' => 'Bạn là AI Thư ký của THEMIS HQ.',
        ]);
        $this->app->instance(PersonaLoader::class, $personas);
        $skills = Mockery::mock(SkillLoader::class)->makePartial();
        foreach (['test_assistance' => ['test_probe', 'request_approval'], 'test_briefing' => ['test_probe']] as $name => $tools) {
            $skills->shouldReceive('load')->with($name)->andReturn([
                'name' => $name, 'trigger' => 'chat', 'tools' => $tools,
                'instructions' => 'Nếu thiếu thông tin quan trọng, hỏi lại. Test fixture only.',
            ]);
        }
        $this->app->instance(SkillLoader::class, $skills);
        $registry = app(ToolRegistry::class);
        $this->app->instance(ToolRegistry::class, $registry);
        $registry->register(new class implements Tool
        {
            public function definition(): array
            {
                return ['name' => 'test_probe', 'description' => 'Test-only echo tool',
                    'input_schema' => ['type' => 'object', 'properties' => new \stdClass]];
            }

            public function execute(array $input): array
            {
                if ($input['fail'] ?? false) {
                    throw new RuntimeException('Fixture execution failed');
                }

                return $input;
            }
        });
    }
}
