<?php

namespace Tests\Feature;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseFile;
use App\Models\Client;
use App\Models\ExternalStorageLocation;
use App\Models\User;
use App\Services\GoogleDriveProvisioningService;
use App\Services\GoogleDriveService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class GoogleDriveProvisioningTest extends TestCase
{
    use RefreshDatabase;

    public function test_client_case_and_generated_folders_are_persisted_and_reused(): void
    {
        $client = Client::create(['name' => 'DRIVE DEMO TEST']);
        $caseFile = CaseFile::create(['title' => '交通事故', 'client_id' => $client->id]);
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('configuredRootFolderId')->once()->andReturn('themis_root');
        $drive->shouldReceive('assertWritableFolder')->once()->with('themis_root');
        $drive->shouldReceive('ensureFolder')->once()->with('themis_root', 'Client', 'system:client_root', true)
            ->andReturn($this->folder('client_root'));
        $drive->shouldReceive('ensureFolder')->once()->with('client_root', 'CL-'.$client->id.'_DRIVE DEMO TEST', 'client:'.$client->id)
            ->andReturn($this->folder('client_folder'));
        $drive->shouldReceive('ensureFolder')->once()->with('client_folder', 'CASE-'.$caseFile->id.'_交通事故', 'case_file:'.$caseFile->id)
            ->andReturn($this->folder('case_folder'));
        $drive->shouldReceive('ensureFolder')->once()->with('case_folder', '作成書類', 'case_file:'.$caseFile->id.':generated_documents')
            ->andReturn($this->folder('generated_folder'));

        $service = new GoogleDriveProvisioningService($drive);
        $first = $service->provisionCaseStructure($caseFile);
        $again = $service->provisionCaseStructure($caseFile);

        $this->assertSame('case_folder', $first->external_folder_id);
        $this->assertSame($first->id, $again->id);
        $this->assertDatabaseCount('external_storage_locations', 4);
        $this->assertSame(1, ExternalStorageLocation::where('entity_type', 'client')->where('entity_id', $client->id)->count());
        $this->assertSame(2, ExternalStorageLocation::where('entity_type', 'case_file')->where('entity_id', $caseFile->id)->count());
    }

    public function test_drive_failure_keeps_client_and_retry_can_succeed(): void
    {
        $this->seed(RolePermissionSeeder::class);
        Sanctum::actingAs(User::factory()->withRole('level_5')->create());
        $location = new ExternalStorageLocation([
            'external_folder_id' => 'client_folder',
            'external_url' => 'https://drive.google.com/drive/folders/client_folder',
        ]);
        $provisioning = Mockery::mock(GoogleDriveProvisioningService::class);
        $provisioning->shouldReceive('provisionClient')->once()->andThrow(
            new GeneratedDocumentDriveException('Provider unavailable')
        );
        $provisioning->shouldReceive('provisionClient')->once()->andReturn($location);
        $this->app->instance(GoogleDriveProvisioningService::class, $provisioning);

        $created = $this->postJson('/api/clients', [
            'name' => 'DRIVE FAILURE RETRY TEST',
            'client_type' => 'individual',
        ])->assertCreated()->assertJsonPath('drive.status', 'failed');

        $clientId = $created->json('client.id');
        $this->assertDatabaseHas('clients', ['id' => $clientId, 'name' => 'DRIVE FAILURE RETRY TEST']);
        $this->postJson("/api/clients/{$clientId}/google-drive/provision")
            ->assertOk()
            ->assertJsonPath('drive.status', 'ready');
        $this->assertDatabaseCount('clients', 1);
    }

    /** @return array{id: string, url: string} */
    private function folder(string $id): array
    {
        return ['id' => $id, 'url' => 'https://drive.google.com/drive/folders/'.$id];
    }
}
