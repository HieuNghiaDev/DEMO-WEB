<?php

namespace Tests\Engine\HostingG6;

use App\Models\{CaseDocument, CaseFile, CaseTask, ExternalStorageLocation, User};
use App\Services\{GoogleDriveProvisioningService, GoogleDriveService, LocalC001Installation};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;
use Themis\Staging\{Installer, Target};

require_once dirname(__DIR__, 3).'/database/staging/Target.php';
require_once dirname(__DIR__, 3).'/database/staging/Installer.php';

class StagingWorkflowHarness extends TestCase
{
    private string $root;
    private array $admission;

    public function createApplication()
    {
        $this->root = getenv('G6_PRIVATE_RUN');
        $this->admission = json_decode(file_get_contents($this->root.'/admission.json'), true, flags: JSON_THROW_ON_ERROR);
        $c = json_decode(file_get_contents($this->root.'/runtime.json'), true, flags: JSON_THROW_ON_ERROR);
        return Installer::application($this->admission, $c, $this->root);
    }
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('production', app()->environment());
        $this->assertSame($this->admission['database'], DB::connection()->getDatabaseName());
        $this->assertSame(Target::PURPOSE, DB::table('g6_synthetic_admission')->value('purpose'));
        $this->assertFalse(app(LocalC001Installation::class)->enabled());
        $this->assertFalse(config('services.google_drive.enabled'));
        $this->assertNull(config('services.google_drive.service_account_json'));
        $this->assertNull(config('services.google_drive.oauth_token_path'));
        $this->assertFileDoesNotExist(storage_path('app/private/c001-local-installation.enc'));
        Http::preventStrayRequests();
    }
    private function user(string $name): User { return User::where('login_id', $name)->sole(); }
    private function base(): string { return '/api/case-files/'.CaseFile::where('reference_number', 'G6-NORMAL')->sole()->id; }

    public function test_initial_fixture_permissions_and_unique_credentials_are_exact(): void
    {
        $fixture = json_decode(file_get_contents(dirname(__DIR__, 3).'/database/staging/fixtures.json'), true);
        foreach ($fixture['initial_counts'] as $table => $count) $this->assertSame($count, DB::table($table)->count(), $table);
        $passwords = json_decode(file_get_contents($this->root.'/synthetic-credential-handover.json'), true);
        $this->assertCount(5, array_unique($passwords));
        foreach ($fixture['accounts'] as $label => $permissions) {
            $actual = $this->user($label)->roles()->with('permissions')->sole()->permissions->pluck('name')->sort()->values()->all();
            sort($permissions); $this->assertSame($permissions, $actual);
            $this->assertFalse($this->user($label)->hasPermission('document.approve_legal'));
        }
        $this->assertSame(0, DB::table('permissions')->where('name', 'document.approve_legal')->count());
        Http::assertNothingSent();
    }

    public function test_real_synthetic_login_logout_and_inactive_login(): void
    {
        $passwords = json_decode(file_get_contents($this->root.'/synthetic-credential-handover.json'), true);
        $u = $this->user('STG_ASSIGNED_STAFF');
        $r = $this->postJson('/api/login', ['email' => $u->email, 'password' => $passwords['STG_ASSIGNED_STAFF']])->assertOk();
        $this->withToken($r->json('token'))->getJson('/api/me')->assertOk();
        $this->postJson('/api/logout')->assertOk(); $this->app['auth']->forgetGuards();
        $this->getJson('/api/me')->assertUnauthorized(); $this->flushHeaders();
        $this->postJson('/api/login', ['email' => $this->user('STG_INACTIVE_USER')->email,
            'password' => $passwords['STG_INACTIVE_USER']])->assertUnprocessable();
    }

    public function test_staff_lists_counts_search_and_direct_ids_do_not_disclose_foreign_task(): void
    {
        $tasks = CaseTask::orderBy('id')->get(); $base = $this->base().'/case-tasks';
        $this->actingAs($this->user('STG_ASSIGNED_STAFF'), 'sanctum')->getJson($base.'?per_page=10')
            ->assertOk()->assertJsonCount(1, 'tasks')->assertJsonPath('pagination.total', 1)->assertDontSee('G6_PRIVATE_DESCRIPTION_2');
        $this->getJson($base.'/'.$tasks[1]->id)->assertForbidden()->assertDontSee('G6_PRIVATE_DESCRIPTION_2');
        $this->actingAs($this->user('STG_UNASSIGNED_STAFF'), 'sanctum')->getJson($base.'?search=PRIVATE&per_page=10')
            ->assertOk()->assertJsonCount(0, 'tasks')->assertJsonPath('pagination.total', 0)->assertDontSee('G6_PRIVATE_DESCRIPTION');
        $this->getJson($base.'/'.$tasks[0]->id)->assertForbidden();
        $doc = CaseDocument::orderBy('id')->first();
        $this->patchJson($this->base().'/document-collection/'.$doc->id, ['necessity_status' => 'not_required'])->assertForbidden();
        $this->assertSame('required', $doc->fresh()->necessity_status);
    }

    public function test_manager_can_manage_case_and_tasks_but_cannot_finalize_legal_document(): void
    {
        $this->actingAs($this->user('STG_MANAGER'), 'sanctum');
        $this->getJson($this->base().'/workspace')->assertOk();
        $doc = CaseDocument::orderBy('id')->first();
        $this->patchJson($this->base().'/document-collection/'.$doc->id, ['necessity_status' => 'required'])->assertOk();
        $this->postJson($this->base().'/document-collection/'.$doc->id.'/creation/c001/final-decisions',
            ['generated_document_id' => 1, 'request_key' => 'synthetic-g6', 'proof_id' => 1])->assertForbidden();
        $this->assertSame(0, DB::table('c001_legal_decisions')->count());
        Http::assertNothingSent();
    }

    public function test_synthetic_upload_return_reupload_and_ordinary_review_preserve_versions(): void
    {
        // Test-container doubles only; no runtime fake switch or production provider registration.
        $folder = (new ExternalStorageLocation)->forceFill(['external_folder_id' => 'G6-SYNTHETIC']);
        $this->mock(GoogleDriveProvisioningService::class)->shouldReceive('provisionGeneratedDocuments')->twice()->andReturn($folder);
        $root = $this->root;
        $this->mock(GoogleDriveService::class)->shouldReceive('storeTaskSubmission')->twice()
            ->andReturnUsing(function (string $bytes, string $name, string $mime, string $folder, string $key) use ($root): array {
                if (PHP_SAPI !== 'cli' || $folder !== 'G6-SYNTHETIC' || ! str_starts_with($bytes, "%PDF-1.4\n% G6 SYNTHETIC")) {
                    throw new \LogicException('Out-of-context synthetic file.');
                }
                Target::assertServer(DB::connection()->getPdo(), $this->admission, $this->admission['runtime_user']);
                $file = $root.'/synthetic-files/'.bin2hex(random_bytes(12)).'.pdf';
                file_put_contents($file, $bytes);
                return ['external_file_id' => basename($file), 'external_url' => 'https://synthetic.invalid/private/'.basename($file),
                    'filename' => $name, 'mime_type' => $mime, 'checksum' => hash('sha256', $bytes)];
            });
        $task = CaseTask::orderBy('id')->first(); $base = $this->base().'/case-tasks/'.$task->id;
        $staff = $this->user('STG_ASSIGNED_STAFF'); $reviewer = $this->user('STG_ORDINARY_REVIEWER');
        $this->actingAs($staff, 'sanctum')->postJson($base.'/accept')->assertOk();
        $this->post($base.'/submissions', ['file' => UploadedFile::fake()->createWithContent('wrong.zip', 'SYNTHETIC')],
            ['Accept' => 'application/json'])->assertUnprocessable();
        $ids = [];
        foreach ([1, 2] as $version) {
            $r = $this->actingAs($staff, 'sanctum')->post($base.'/submissions',
                ['file' => UploadedFile::fake()->createWithContent('g6.pdf', "%PDF-1.4\n% G6 SYNTHETIC v{$version}\n%%EOF")],
                ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('submission.version', $version);
            $ids[] = $r->json('submission.id');
            $this->actingAs($reviewer, 'sanctum');
            if ($version === 1) $this->postJson($base.'/submissions/'.$ids[0].'/reject', ['reason' => '最新版が必要'])->assertOk();
            else $this->postJson($base.'/submissions/'.$ids[1].'/approve')->assertOk();
        }
        $this->assertSame('completed', $task->fresh()->status);
        $this->assertSame(['rejected', 'approved'], DB::table('case_task_submissions')->orderBy('version')->pluck('review_status')->all());
        $this->assertGreaterThan(0, DB::table('case_activities')->count());
        $this->assertCount(2, glob($root.'/synthetic-files/*.pdf'));
        Http::assertNothingSent();
    }

    public function test_nonempty_installation_and_runtime_schema_writes_are_denied(): void
    {
        try { Target::assertEmpty(DB::connection()->getPdo()); $this->fail('Nonempty target accepted.'); }
        catch (\LogicException) { $this->addToAssertionCount(1); }
        $grants = implode(' ', array_map(fn ($r) => implode(' ', (array) $r), DB::select('SHOW GRANTS FOR CURRENT_USER()')));
        $this->assertStringNotContainsString('ALL PRIVILEGES', $grants);
        $this->assertStringNotContainsString('CREATE', $grants);
        $this->assertStringNotContainsString('GRANT OPTION', $grants);
    }

    public function test_manager_creates_a_normal_case_and_assigned_task_with_explicit_grants(): void
    {
        $this->actingAs($this->user('STG_MANAGER'), 'sanctum');
        $r = $this->postJson('/api/case-files', ['title' => 'SYNTHETIC CREATED VIA API', 'classification' => 'normal',
            'case_type_id' => DB::table('case_types')->sole()->id, 'client_id' => DB::table('clients')->sole()->id])
            ->assertCreated();
        $caseId = $r->json('case_file.id');
        $this->assertTrue(CaseFile::whereKey($caseId)->where('is_confidential', false)->exists());
        $doc = CaseDocument::create(['case_file_id' => $caseId, 'title' => 'SYNTHETIC API TASK DOCUMENT',
            'category' => '必要資料', 'requirement_level' => 'required', 'necessity_status' => 'undetermined', 'status' => 'not_requested']);
        $this->patchJson('/api/case-files/'.$caseId.'/document-collection/'.$doc->id, ['necessity_status' => 'required'])->assertOk();
        $this->postJson('/api/case-files/'.$caseId.'/case-tasks/batch', ['tasks' => [[
            'case_document_id' => $doc->id, 'assigned_employee_id' => $this->user('STG_ASSIGNED_STAFF')->employee_id,
            'due_date' => now()->addWeek()->toDateString()]]])->assertCreated()->assertJsonCount(1, 'tasks');
        Http::assertNothingSent();
    }
}
