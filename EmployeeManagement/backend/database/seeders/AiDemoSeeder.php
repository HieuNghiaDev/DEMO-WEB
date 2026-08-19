<?php

namespace Database\Seeders;

use App\Models\ApprovalRequest;
use App\Models\Client;
use App\Models\Matter;
use App\Models\SecretaryLog;
use App\Models\SkillProposal;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class AiDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'development', 'testing'])) {
            throw new RuntimeException('AiDemoSeeder may only run in local, development, or testing environments.');
        }

        $this->call(PersonaSeeder::class);

        $clients = $this->seedClients();
        $matters = $this->seedMatters($clients);

        $this->seedTasks($matters);
        $this->seedApprovalRequests();
        $this->seedSkillProposals();
        $this->seedSecretaryLogs();
    }

    /** @return array<string, Client> */
    private function seedClients(): array
    {
        return [
            'sakura' => Client::updateOrCreate(
                ['name' => 'DEMO Sakura Trading Co.'],
                [
                    'name_vn' => 'DEMO Công ty Sakura Trading',
                    'email' => 'demo-sakura@example.test',
                    'phone' => '000-DEMO-001',
                    'language' => 'ja',
                ],
            ),
            'river' => Client::updateOrCreate(
                ['name' => 'DEMO Riverstone Labs'],
                [
                    'name_vn' => 'DEMO Riverstone Labs',
                    'email' => 'demo-riverstone@example.test',
                    'phone' => '000-DEMO-002',
                    'language' => 'en',
                ],
            ),
            'maple' => Client::updateOrCreate(
                ['name' => 'DEMO Maple Studio'],
                [
                    'name_vn' => 'DEMO Maple Studio',
                    'email' => 'demo-maple@example.test',
                    'phone' => '000-DEMO-003',
                    'language' => 'vi',
                ],
            ),
        ];
    }

    /** @param array<string, Client> $clients
     * @return array<string, Matter>
     */
    private function seedMatters(array $clients): array
    {
        return [
            'contract' => Matter::updateOrCreate(
                ['title' => 'DEMO Contract Review: Sakura Supply Agreement'],
                [
                    'client_id' => $clients['sakura']->id,
                    'status' => 'open',
                    'category' => 'contract',
                    'assigned_to' => 'DEMO-LAWYER-A',
                ],
            ),
            'dispute' => Matter::updateOrCreate(
                ['title' => 'DEMO Dispute Preparation: Riverstone'],
                [
                    'client_id' => $clients['river']->id,
                    'status' => 'in_progress',
                    'category' => 'dispute',
                    'assigned_to' => 'DEMO-LAWYER-B',
                ],
            ),
            'trademark' => Matter::updateOrCreate(
                ['title' => 'DEMO Trademark Filing: Maple Studio'],
                [
                    'client_id' => $clients['maple']->id,
                    'status' => 'pending_review',
                    'category' => 'intellectual_property',
                    'assigned_to' => 'DEMO-LAWYER-A',
                ],
            ),
            'research' => Matter::updateOrCreate(
                ['title' => 'DEMO Internal Research: AI Employee Pilot'],
                [
                    'client_id' => null,
                    'status' => 'open',
                    'category' => 'internal',
                    'assigned_to' => 'DEMO-TEAM',
                ],
            ),
        ];
    }

    /** @param array<string, Matter> $matters */
    private function seedTasks(array $matters): void
    {
        $tasks = [
            [
                'title' => 'DEMO TASK: Review Sakura agreement checklist',
                'matter' => 'contract',
                'horizon' => 'short',
                'due_date' => today()->setTime(16, 0),
                'status' => 'pending',
                'source' => 'manual',
                'assigned_to' => 'DEMO-LAWYER-A',
            ],
            [
                'title' => 'DEMO TASK: Draft Riverstone client update',
                'matter' => 'dispute',
                'horizon' => 'short',
                'due_date' => today()->addDay()->setTime(10, 0),
                'status' => 'in_progress',
                'source' => 'ai_generated',
                'assigned_to' => 'DEMO-LAWYER-B',
            ],
            [
                'title' => 'DEMO TASK: Confirm Maple filing documents',
                'matter' => 'trademark',
                'horizon' => 'short',
                'due_date' => today()->addDays(3)->setTime(15, 0),
                'status' => 'pending',
                'source' => 'manual',
                'assigned_to' => 'DEMO-LAWYER-A',
            ],
            [
                'title' => 'DEMO TASK: Research pilot data handling rules',
                'matter' => 'research',
                'horizon' => 'mid',
                'due_date' => today()->addDays(7)->setTime(17, 0),
                'status' => 'pending',
                'source' => 'ai_generated',
                'assigned_to' => 'DEMO-TEAM',
            ],
            [
                'title' => 'DEMO TASK: Prepare contract strategy notes',
                'matter' => 'contract',
                'horizon' => 'mid',
                'due_date' => today()->addDays(14)->setTime(11, 0),
                'status' => 'pending',
                'source' => 'manual',
                'assigned_to' => 'DEMO-LAWYER-A',
            ],
            [
                'title' => 'DEMO TASK: Archive completed pilot research',
                'matter' => 'research',
                'horizon' => 'mid',
                'due_date' => today()->subDay()->setTime(16, 0),
                'status' => 'completed',
                'source' => 'ai_generated',
                'assigned_to' => 'DEMO-TEAM',
            ],
            [
                'title' => 'DEMO TASK: Plan Sakura annual contract review',
                'matter' => 'contract',
                'horizon' => 'long',
                'due_date' => today()->addDays(45)->setTime(10, 0),
                'status' => 'pending',
                'source' => 'manual',
                'assigned_to' => 'DEMO-LAWYER-A',
            ],
            [
                'title' => 'DEMO TASK: Review AI pilot outcomes',
                'matter' => 'research',
                'horizon' => 'long',
                'due_date' => today()->addDays(90)->setTime(14, 0),
                'status' => 'pending',
                'source' => 'ai_generated',
                'assigned_to' => 'DEMO-TEAM',
            ],
        ];

        foreach ($tasks as $task) {
            Task::updateOrCreate(
                ['title' => $task['title']],
                [
                    'matter_id' => $matters[$task['matter']]->id,
                    'horizon' => $task['horizon'],
                    'due_date' => $task['due_date'],
                    'status' => $task['status'],
                    'source' => $task['source'],
                    'assigned_to' => $task['assigned_to'],
                ],
            );
        }
    }

    private function seedApprovalRequests(): void
    {
        $userId = User::query()->value('id');

        foreach ([
            [
                'action_type' => 'demo_send_client_update',
                'tool_name' => 'request_approval',
                'payload' => ['label' => 'DEMO: Send client update'],
                'status' => 'pending',
            ],
            [
                'action_type' => 'demo_publish_internal_summary',
                'tool_name' => 'request_approval',
                'payload' => ['label' => 'DEMO: Publish internal summary'],
                'status' => 'approved',
                'approved_by' => $userId,
                'approved_at' => now()->subHour(),
            ],
            [
                'action_type' => 'demo_remove_draft_document',
                'tool_name' => 'request_approval',
                'payload' => ['label' => 'DEMO: Remove draft document'],
                'status' => 'rejected',
                'rejected_by' => $userId,
                'rejected_at' => now()->subMinutes(30),
            ],
        ] as $approval) {
            ApprovalRequest::updateOrCreate(
                ['action_type' => $approval['action_type']],
                [
                    ...$approval,
                    'requested_by' => $userId,
                ],
            );
        }
    }

    private function seedSkillProposals(): void
    {
        foreach ([
            [
                'skill_name' => 'demo_task_management',
                'status' => 'draft',
                'proposed_content' => '# DEMO draft task management update',
                'reason' => 'Demo proposal for Phase 1 review.',
            ],
            [
                'skill_name' => 'demo_morning_briefing',
                'status' => 'pending_review',
                'proposed_content' => '# DEMO morning briefing refinement',
                'reason' => 'Demo proposal awaiting review.',
            ],
            [
                'skill_name' => 'demo_internal_summary',
                'status' => 'approved',
                'proposed_content' => '# DEMO approved internal summary skill',
                'reason' => 'Demo approved proposal.',
            ],
        ] as $proposal) {
            SkillProposal::updateOrCreate(
                [
                    'skill_name' => $proposal['skill_name'],
                    'proposed_by' => 'AI_DEMO_SEEDER',
                ],
                [
                    ...$proposal,
                    'current_content' => '# DEMO current content',
                    'proposed_by' => 'AI_DEMO_SEEDER',
                    'decided_by' => $proposal['status'] === 'approved' ? 'DEMO-REVIEWER' : null,
                    'decided_at' => $proposal['status'] === 'approved' ? now()->subDay() : null,
                ],
            );
        }
    }

    private function seedSecretaryLogs(): void
    {
        foreach ([
            [
                'skill_name' => 'task_management',
                'trigger_type' => 'demo_seed',
                'input' => ['action' => 'list_tasks', 'label' => 'DEMO task listing'],
                'output' => ['count' => 3],
                'status' => 'success',
            ],
            [
                'skill_name' => 'morning_briefing',
                'trigger_type' => 'demo_seed',
                'input' => ['action' => 'prepare_briefing', 'label' => 'DEMO briefing'],
                'output' => ['summary' => 'DEMO: 要確認 task summary'],
                'status' => 'success',
            ],
            [
                'skill_name' => 'task_management',
                'trigger_type' => 'demo_seed_failed',
                'input' => ['action' => 'update_task', 'label' => 'DEMO failed update'],
                'output' => ['error' => 'DEMO validation example'],
                'status' => 'failed',
            ],
        ] as $log) {
            SecretaryLog::firstOrCreate(
                [
                    'skill_name' => $log['skill_name'],
                    'trigger_type' => $log['trigger_type'],
                    'status' => $log['status'],
                ],
                [
                    'input' => $log['input'],
                    'output' => $log['output'],
                ],
            );
        }
    }
}
