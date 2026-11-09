<?php

namespace Tests\Support\C001;

use App\Models\C001LegalDecision;
use App\Services\{C001DecisionContext,C001FinalApprovalWriter,GoogleDriveService};
use App\Services\Administration\Totp;
use Illuminate\Support\Facades\DB;
use Mockery;

/** Synthetic writer/MFA fixtures shared by C001 security tests only. */
trait BuildsC001DecisionFixtures
{
    protected array $bytes = ['workbook' => 'SYNTHETIC WORKBOOK', 'pdf' => '%PDF-SYNTHETIC'];
    protected array $c;
    protected string $secret;
    protected string $token;
    protected string $key = 'synthetic-decision-00000001';

    protected function prepared(): void
    {
        $this->c = $this->context();
        $c = $this->c;
        // Begin a NEW version under a server-authenticated contributor. Never certify legacy history.
        $this->actingAs($c['author']);
        $generated = DB::transaction(function () use ($c) {
            $generated = $c['document']->generatedDocuments()->create([
                'document_generation_template_id' => $c['generated']->document_generation_template_id,
                'version' => 2, 'workflow_status' => 'review', 'draft_data' => ['synthetic' => 'prepared'],
                'created_by' => $c['author']->id, 'updated_by' => $c['author']->id]);
            foreach (['source_workbook' => 'workbook', 'pdf' => 'pdf'] as $kind => $id) {
                $generated->artifacts()->create(['artifact_type' => $kind, 'storage_provider' => 'google_drive',
                    'external_file_id' => $id, 'external_url' => 'https://example.test/'.$id, 'filename' => 'synthetic.'.$id,
                    'mime_type' => 'application/octet-stream', 'checksum' => hash('sha256', $this->bytes[$id]),
                    'uploaded_by' => $c['author']->id, 'uploaded_at' => now()]);
            }
            return $generated;
        });
        $c['policy']->ledgers[$generated->id.':2'] = [$c['author']->id];
        $terms = $this->evidence(false);
        $c['policy']->delegations[$c['policy']->key($c['lawyer'], $c['issuer'], $terms, $generated)] = true;
        $this->actingAs($c['issuer']);
        $c['grant'] = $c['service']->issueDelegation($c['issuer'], $c['lawyer'], $generated, $terms);
        $c['generated'] = $generated;
        $this->c = $c;
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadFileContent')->andReturnUsing(fn ($id) => $this->bytes[$id]);
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->enrollAndLogin();
    }

    protected function enrollAndLogin(): void
    {
        $this->flushHeaders(); $this->app['auth']->forgetGuards();
        $lawyer = $this->c['lawyer'];
        $payload = ['email' => $lawyer->email, 'password' => self::SYNTHETIC_PASSWORD];
        $passwordToken = $this->postJson('/api/login', $payload)->assertOk()->json('token');
        $this->app['auth']->forgetGuards();
        $challenge = $this->withToken($passwordToken)->postJson('/api/mfa/enrollment/opt-in', ['password' => self::SYNTHETIC_PASSWORD])
            ->assertOk()->assertJsonPath('purpose', 'opt_in_enroll')->json('challenge');
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->secret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertOk()->json('secret');
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp)])->assertOk();
        $challenge = $this->postJson('/api/login', $payload)->assertStatus(202)->json('challenge');
        $this->travel(31)->seconds();
        $this->token = $this->postJson('/api/mfa/login', ['challenge' => $challenge,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp)])->assertOk()->json('token');
        $this->app['auth']->forgetGuards(); $this->withToken($this->token)->getJson('/api/me')->assertOk();
    }

    protected function stepResponse(): \Illuminate\Testing\TestResponse
    {
        $this->travel(31)->seconds();
        $this->app['auth']->forgetGuards();
        return $this->withToken($this->token)->postJson('/api/mfa/step-up', [
            'password' => self::SYNTHETIC_PASSWORD, 'otp' => app(Totp::class)->code($this->secret, now()->timestamp),
            'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => $this->c['generated']->id, 'request_key' => $this->key]]);
    }

    protected function proof(): int
    {
        return $this->stepResponse()->assertOk()->assertJsonPath('expires_in', 300)->json('legal_proof_id');
    }

    protected function decide(int $proof, ?string $key = null): C001LegalDecision
    {
        return app(C001FinalApprovalWriter::class)->approveDecision($this->c['case'], $this->c['document'],
            $this->c['lawyer'], $this->c['generated']->fresh(), $key ?? $this->key, $proof);
    }

}
