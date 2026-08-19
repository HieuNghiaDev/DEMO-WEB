<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CaseFileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_create_and_view_a_case_file_with_records(): void
    {
        $user = User::factory()->create();
        $client = Client::create(['name' => 'DEMO API Client']);
        $case = $this->actingAs($user, 'sanctum')->postJson('/api/case-files', ['title' => 'DEMO API Case', 'client_id' => $client->id, 'status' => 'active'])->assertCreated()->json('case_file');
        $this->actingAs($user, 'sanctum')->postJson("/api/case-files/{$case['id']}/documents", ['category' => '証拠', 'title' => 'DEMO Evidence'])->assertCreated();
        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case['id']}")->assertOk()->assertJsonPath('case_file.client.name', 'DEMO API Client')->assertJsonCount(1, 'case_file.documents');
    }
}
