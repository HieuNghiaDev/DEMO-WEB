<?php

namespace Tests\Feature;

use App\Models\Persona;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PersonaApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_personas_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/personas')->assertUnauthorized();
    }

    public function test_personas_endpoint_returns_only_active_personas(): void
    {
        $activePersona = Persona::create([
            'name' => 'secretary',
            'display_name' => 'AI 秘書',
            'skills' => ['task_management', 'morning_briefing'],
            'active' => true,
        ]);

        Persona::create([
            'name' => 'paralegal',
            'display_name' => 'AI パラリーガル',
            'skills' => [],
            'active' => false,
        ]);

        $this->actingAs(User::factory()->create(), 'sanctum')
            ->getJson('/api/personas')
            ->assertOk()
            ->assertExactJson([
                'personas' => [[
                    'id' => $activePersona->id,
                    'name' => 'secretary',
                    'display_name' => 'AI 秘書',
                    'skills' => ['task_management', 'morning_briefing'],
                ]],
            ]);
    }
}
