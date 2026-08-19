<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\Client;
use App\Models\Matter;
use App\Models\Persona;
use App\Models\SecretaryLog;
use App\Models\SkillProposal;
use App\Models\Task;
use Database\Seeders\AiDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_seeds_idempotent_demo_data(): void
    {
        app(AiDemoSeeder::class)->run();
        app(AiDemoSeeder::class)->run();

        $this->assertSame(3, Client::query()->where('name', 'like', 'DEMO %')->count());
        $this->assertSame(4, Matter::query()->where('title', 'like', 'DEMO %')->count());
        $this->assertSame(8, Task::query()->where('title', 'like', 'DEMO TASK:%')->count());
        $this->assertSame(1, Persona::query()->where('name', 'secretary')->count());
        $this->assertSame(3, ApprovalRequest::query()->where('action_type', 'like', 'demo_%')->count());
        $this->assertSame(3, SkillProposal::query()->where('proposed_by', 'AI_DEMO_SEEDER')->count());
        $this->assertSame(3, SecretaryLog::query()->where('trigger_type', 'like', 'demo_seed%')->count());

        $this->assertDatabaseHas('tasks', [
            'title' => 'DEMO TASK: Review Sakura agreement checklist',
            'horizon' => 'short',
            'status' => 'pending',
            'source' => 'manual',
        ]);
        $this->assertDatabaseHas('tasks', [
            'title' => 'DEMO TASK: Review AI pilot outcomes',
            'horizon' => 'long',
            'source' => 'ai_generated',
        ]);
    }
}
