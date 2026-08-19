<?php

namespace Tests\Unit;

use App\Models\ApprovalRequest;
use App\Models\SecretaryLog;
use App\Services\ApprovalGuard;
use App\Services\ToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class ApprovalInfrastructureTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_approval_creates_a_pending_request_with_json_payload(): void
    {
        $result = app(ToolRegistry::class)->execute('request_approval', [
            'action_type' => 'send_email',
            'tool_name' => 'send_email',
            'payload' => ['recipient' => 'client@example.com', 'subject' => 'Update'],
        ]);

        $this->assertSame('pending', $result['status']);
        $this->assertSame('send_email', $result['action_type']);
        $this->assertDatabaseHas('approval_requests', [
            'id' => $result['approval_id'],
            'status' => 'pending',
            'tool_name' => 'send_email',
        ]);
        $this->assertSame(
            ['recipient' => 'client@example.com', 'subject' => 'Update'],
            ApprovalRequest::findOrFail($result['approval_id'])->payload,
        );
        $this->assertDatabaseCount('secretary_logs', 1);
        $this->assertSame('tool', SecretaryLog::firstOrFail()->trigger_type);
    }

    public function test_registry_registers_request_approval(): void
    {
        $registry = app(ToolRegistry::class);

        $this->assertTrue($registry->has('request_approval'));
        $this->assertSame('request_approval', $registry->get('request_approval')['name']);
    }

    public function test_guard_allows_an_approved_matching_action(): void
    {
        $approval = ApprovalRequest::create([
            'action_type' => 'send_email',
            'status' => 'approved',
            'approved_at' => now(),
        ]);

        $result = app(ApprovalGuard::class)->assertApproved('send_email', $approval->id);

        $this->assertSame($approval->id, $result->id);
    }

    #[DataProvider('blockedApprovalStatuses')]
    public function test_guard_blocks_unapproved_requests(string $status): void
    {
        $approval = ApprovalRequest::create([
            'action_type' => 'send_email',
            'status' => $status,
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage("Approval request [{$approval->id}] is not approved.");

        app(ApprovalGuard::class)->assertApproved('send_email', $approval->id);
    }

    public static function blockedApprovalStatuses(): array
    {
        return [['pending'], ['rejected']];
    }

    public function test_guard_blocks_a_missing_approval(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Approval request [999] was not found.');

        app(ApprovalGuard::class)->assertApproved('send_email', 999);
    }

    public function test_guard_blocks_an_action_type_mismatch(): void
    {
        $approval = ApprovalRequest::create([
            'action_type' => 'send_email',
            'status' => 'approved',
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage("Approval request [{$approval->id}] does not authorize action [create_invoice].");

        app(ApprovalGuard::class)->assertApproved('create_invoice', $approval->id);
    }
}
