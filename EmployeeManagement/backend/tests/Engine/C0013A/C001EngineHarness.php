<?php

namespace Tests\Engine\C0013A;

use App\Contracts\C001AuthorityPolicy;
use App\Models\C001LegalDecision;
use App\Models\CaseGeneratedDocument;
use App\Models\Permission;
use App\Models\SecurityAuditLog;
use App\Services\C001DecisionContext;
use App\Services\C001FinalApprovalWriter;
use App\Services\LegalFinalizationGate;
use App\Services\PendingC001AuthorityPolicy;
use App\Services\GoogleDriveService;
use App\Services\Administration\Totp;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

require_once __DIR__.'/EngineBase.php';
require_once __DIR__.'/EngineDecisionFixtures.php';

class C001EngineHarness extends EngineBase
{
    use EngineDecisionFixtures;

    public function test_complete_positive_totp_decision_and_lost_response_retry_are_exactly_once(): void
    {
        $this->prepared(); $proof = $this->proof();
        $receipt = $this->decide($proof);
        $this->assertSame('final_approve', $receipt->decision_type);
        $this->assertArrayNotHasKey('draft_data', $receipt->context);
        $this->assertStringNotContainsString('SYNTHETIC WORKBOOK', json_encode($receipt->getAttributes(), JSON_THROW_ON_ERROR));
        $this->assertSame('approved', $this->c['generated']->fresh()->workflow_status);
        $this->assertSame($this->c['lawyer']->id, $this->c['generated']->fresh()->approved_by);
        $this->assertSame('reviewed', $this->c['document']->fresh()->review_status);
        $before = $this->businessState();
        $this->travel(6)->minutes();
        $this->assertSame($receipt->id, $this->decide($proof)->id);
        $this->assertSame($before, $this->businessState());
        $this->assertEngineCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->where('metadata->case_generated_document_id', $this->c['generated']->id)->count());
        $this->assertNotNull(DB::table('authentication_challenges')->where('id', DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id'))->value('used_at'));
        $this->assertTrue(LegalFinalizationGate::policyPending());
    }

    public static function invalidAuthority(): array
    {
        return array_map(fn ($case) => [$case], ['no_verifier', 'inactive_verifier', 'verifier_employee_inactive',
            'verifier_permission', 'expired_verification', 'revoked_verification', 'no_issuer', 'issuer_permission',
            'issuer_equals_approver', 'issuer_admission', 'expired_delegation', 'revoked_delegation',
            'creator', 'editor', 'submitter', 'incomplete_provenance', 'default_pending']);
    }

    #[DataProvider('invalidAuthority')]
    public function test_invalid_independent_authority_cannot_issue_a_legal_proof(string $state): void
    {
        $this->prepared(); $c = $this->c;
        switch ($state) {
            case 'no_verifier': $c['policy']->verifications = []; break;
            case 'inactive_verifier': $c['verifier']->update(['is_active' => false]); break;
            case 'verifier_employee_inactive': $c['verifier']->employee->update(['status' => 'inactive']); break;
            case 'verifier_permission': $c['verifier']->roles()->sole()->permissions()->detach(); break;
            case 'expired_verification': $c['verification']->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'revoked_verification': $c['service']->revokeVerification($c['verifier'], $c['verification']); break;
            case 'no_issuer': $c['policy']->delegations = []; break;
            case 'issuer_permission': $c['issuer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.delegate_legal')->value('id')); break;
            case 'issuer_equals_approver': $c['grant']->forceFill(['issuer_user_id' => $c['lawyer']->id, 'issuer_employee_id' => $c['lawyer']->employee_id])->save(); break;
            case 'issuer_admission': $this->authorityActor($c['admitter'],fn()=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission'])); break;
            case 'expired_delegation': $c['grant']->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'revoked_delegation': $this->authorityActor($c['issuer'], fn()=>$c['service']->revokeDelegation($c['issuer'], $c['grant'])); break;
            case 'creator': $c['generated']->update(['created_by' => $c['lawyer']->id]); break;
            case 'editor': $c['generated']->update(['updated_by' => $c['lawyer']->id]); break;
            case 'submitter':
                $task = $c['case']->caseTasks()->create(['case_document_id' => $c['document']->id, 'title' => 'Synthetic', 'priority' => 'normal', 'status' => 'pending_review']);
                $task->submissions()->create(['case_document_id' => $c['document']->id, 'case_generated_document_id' => $c['generated']->id,
                    'version' => 2, 'source_type' => 'auto_generated', 'review_status' => 'pending_review', 'filename' => 'synthetic.pdf',
                    'external_file_id' => 'synthetic', 'mime_type' => 'application/pdf',
                    'external_url' => 'https://example.test/synthetic', 'submitted_by' => $c['lawyer']->id, 'submitted_at' => now()]); break;
            case 'incomplete_provenance': $c['generated']->update(['draft_data' => ['synthetic' => 'untrusted editor']]); break;
            case 'default_pending': $this->app->instance(C001AuthorityPolicy::class, new PendingC001AuthorityPolicy); break;
        }
        $response = $this->stepResponse();
        $this->assertContains($response->status(), [403, 409]);
        $this->assertEngineCount('c001_legal_proofs', 0);
        $this->assertEngineCount('c001_legal_decisions', 0);
    }

    public static function changedProofs(): array
    {
        return array_map(fn ($state) => [$state], ['missing', 'expired', 'consumed', 'admin_action', 'wrong_action', 'wrong_scope',
            'workbook_bytes', 'pdf_bytes', 'workbook_hash', 'pdf_hash', 'snapshot', 'template', 'wrong_case', 'wrong_document',
            'wrong_generated', 'wrong_version', 'revoked_delegation', 'different_request_key']);
    }

    #[DataProvider('changedProofs')]
    public function test_changed_context_or_invalid_proof_never_partially_finalizes(string $state): void
    {
        $this->prepared(); $proof = $this->proof();
        $challengeId = DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id');
        $challenge = DB::table('authentication_challenges')->where('id', $challengeId);
        switch ($state) {
            case 'missing': $proof = 99999; break;
            case 'expired': $this->travel(300)->seconds(); break;
            case 'consumed': $challenge->update(['used_at' => now()]); break;
            case 'admin_action': $challenge->update(['action' => 'role.assign']); break;
            case 'wrong_action': $challenge->update(['action' => 'legal.c001.reject']); break;
            case 'wrong_scope': $challenge->update(['scope_hash' => str_repeat('a', 64)]); break;
            case 'workbook_bytes': $this->bytes['workbook'] = 'CHANGED WORKBOOK'; break;
            case 'pdf_bytes': $this->bytes['pdf'] = '%PDF-CHANGED'; break;
            case 'workbook_hash': $this->c['generated']->artifacts()->where('artifact_type', 'source_workbook')->update(['checksum' => str_repeat('a', 64)]); break;
            case 'pdf_hash': $this->c['generated']->artifacts()->where('artifact_type', 'pdf')->update(['checksum' => null]); break;
            case 'snapshot': DB::table('case_generated_documents')->where('id', $this->c['generated']->id)->update(['draft_data' => '{"synthetic":"changed"}']); break;
            case 'template': DB::table('document_generation_templates')->where('id', $this->c['generated']->document_generation_template_id)->update(['template_body' => 'changed']); break;
            case 'wrong_case': $this->c['case'] = $this->matter(); break;
            case 'wrong_document': $this->c['document'] = $this->document($this->c['case']); break;
            case 'wrong_generated': $this->c['generated'] = $this->c['document']->generatedDocuments()->where('version', 1)->firstOrFail(); break;
            case 'wrong_version': $this->c['generated']->update(['version' => 3]); break;
            case 'revoked_delegation': $this->authorityActor($this->c['issuer'], fn()=>$this->c['service']->revokeDelegation($this->c['issuer'], $this->c['grant'])); break;
        }
        $this->denied($proof, key: $state === 'different_request_key' ? 'different-request-0000001' : null);
    }

    public static function failingWrites(): array { return [['audit'], ['receipt'], ['workflow'], ['proof']]; }

    #[DataProvider('failingWrites')]
    public function test_any_required_write_failure_rolls_back_proof_receipt_and_workflow(string $failure): void
    {
        $this->prepared(); $this->attachLinkedSubmission(); $proof = $this->proof(); $before = $this->businessState();
        $target = match ($failure) { 'audit' => 'security_audit_logs', 'receipt' => 'c001_legal_decisions', 'workflow' => 'case_documents', 'proof' => 'authentication_challenges' };
        $operation = in_array($failure,['workflow','proof'],true) ? 'UPDATE' : 'INSERT';
        $when = $failure === 'audit' ? "IF NEW.event = 'legal.c001_approved' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic required write failure'; END IF;" : "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic required write failure';";
        DB::unprepared("CREATE TRIGGER c001_test_write_failure BEFORE {$operation} ON {$target} FOR EACH ROW BEGIN {$when} END");
        try { $this->decide($proof); $this->fail('Required failure must propagate.'); }
        catch (QueryException) { $this->assertSame($before, $this->businessState()); }
        DB::unprepared('DROP TRIGGER c001_test_write_failure');
        $this->assertSame('final_approve', $this->decide($proof)->decision_type);
    }

    public function test_immutable_receipt_provenance_and_approved_content_are_protected_against_raw_writes(): void
    {
        $this->prepared(); $receipt = $this->decide($this->proof());
        foreach (['c001_legal_decisions', 'c001_legal_proofs', 'c001_version_provenance', 'case_generated_documents', 'generated_document_artifacts'] as $table) {
            try { DB::table($table)->where('id', $table === 'case_generated_documents' ? $this->c['generated']->id : ($table === 'c001_legal_decisions' ? $receipt->id : ($table === 'c001_legal_proofs' ? $receipt->proof_id : DB::table($table)->where('case_generated_document_id',$this->c['generated']->id)->value('id'))))->delete(); $this->fail('Immutable evidence deletion must fail: '.$table); }
            catch (QueryException) { $this->assertDatabaseHas('c001_legal_decisions', ['id' => $receipt->id]); }
        }
        foreach (['c001_legal_decisions' => ['request_key' => 'tampered-receipt-key'],
            'c001_legal_proofs' => ['context_hash' => str_repeat('0', 64)],
            'c001_version_provenance' => ['trusted' => false],
            'case_generated_documents' => ['workflow_status' => 'draft'],
            'generated_document_artifacts' => ['checksum' => str_repeat('0', 64)]] as $table => $change) {
            try { DB::table($table)->where('id', $table === 'case_generated_documents' ? $this->c['generated']->id : ($table === 'c001_legal_decisions' ? $receipt->id : ($table === 'c001_legal_proofs' ? $receipt->proof_id : DB::table($table)->where('case_generated_document_id',$this->c['generated']->id)->value('id'))))->update($change); $this->fail('Immutable evidence update must fail: '.$table); }
            catch (QueryException) { $this->assertDatabaseHas('c001_legal_decisions', ['id' => $receipt->id, 'request_key' => $this->key]); }
        }
    }

    public function test_same_key_different_context_and_second_key_cannot_create_a_second_receipt(): void
    {
        $this->prepared(); $proof = $this->proof(); $first = $this->decide($proof);
        $this->denied($proof, 409, 'different-request-0000001');
        try { C001LegalDecision::forceCreate([...$first->getAttributes(), 'id' => null, 'request_key' => 'second-request-00000001']); $this->fail('Unique version/proof constraint must reject a second winner.'); }
        catch (QueryException) { $this->assertEngineCount('c001_legal_decisions', 1); }
    }

    public function test_expired_rolled_back_proof_requires_new_totp_without_extending_the_old_expiry(): void
    {
        $this->prepared(); $proof = $this->proof();
        $oldExpiry = DB::table('c001_legal_proofs')->where('id', $proof)->value('expires_at');
        $this->travel(300)->seconds(); $this->denied($proof, 403);
        $next = $this->proof();
        $this->assertNotSame($proof, $next);
        $this->assertSame($oldExpiry, DB::table('c001_legal_proofs')->where('id', $proof)->value('expires_at'));
        $this->assertSame('final_approve', $this->decide($next)->decision_type);
    }

    public function test_linked_task_submission_completes_in_the_same_atomic_decision(): void
    {
        $this->prepared(); $c = $this->c;
        $this->flushHeaders(); $this->actingAs($c['author']);
        $task = $c['case']->caseTasks()->create(['case_document_id' => $c['document']->id,
            'title' => 'Synthetic linked task', 'status' => 'pending_review', 'priority' => 'normal']);
        $submission = $task->submissions()->create(['case_document_id' => $c['document']->id,
            'case_generated_document_id' => $c['generated']->id, 'version' => 2, 'source_type' => 'auto_generated',
            'review_status' => 'pending_review', 'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf',
            'external_file_id' => 'pdf', 'external_url' => 'https://example.test/pdf',
            'checksum' => hash('sha256', $this->bytes['pdf']), 'submitted_by' => $c['author']->id, 'submitted_at' => now()]);
        $this->decide($this->proof());
        $this->assertSame('completed', $task->fresh()->status);
        $this->assertSame('approved', $submission->fresh()->review_status);
        $this->assertSame($c['lawyer']->id, $submission->fresh()->reviewed_by);
        $this->assertSame(1, DB::table('case_activities')->where('case_file_id',$c['case']->id)->count());
    }

    public function test_totp_cannot_be_replayed_to_mint_another_legal_proof(): void
    {
        $this->prepared(); $this->proof();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => $this->c['generated']->id, 'request_key' => $this->key]])->assertUnprocessable();
        $this->assertEngineCount('c001_legal_proofs', 1);
    }

    public function test_artifact_provider_checks_do_not_run_inside_the_legal_commit(): void
    {
        $this->prepared(); $depth = DB::transactionLevel();
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadFileContent')->times(4)->andReturnUsing(function ($id) use ($depth) {
            $this->assertSame($depth, DB::transactionLevel(), 'No provider I/O inside the legal transaction.');
            return $this->bytes[$id];
        });
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->decide($this->proof());
    }

    public function test_logout_revokes_session_and_proof_without_deleting_legal_evidence(): void
    {
        $this->prepared(); $proof = $this->proof(); $this->decide($proof);
        $this->postJson('/api/logout')->assertOk();
        $this->assertEngineCount('c001_legal_decisions', 1);
        $this->assertEngineCount('c001_legal_proofs', 1);
        $this->denied($proof, 403);
    }

    public function test_two_overlapping_attempts_cannot_reserve_the_same_consumed_proof_twice(): void
    {
        $this->prepared(); $proof = $this->proof(); $attempted = false;
        // Deterministic overlap at the receipt boundary, not a multi-connection MySQL claim.
        C001LegalDecision::creating(function () use ($proof, &$attempted): void {
            if ($attempted) return;
            $attempted = true;
            $this->denied($proof, 409);
        });
        try { $this->decide($proof); }
        finally { \Illuminate\Support\Facades\Event::forget('eloquent.creating: '.C001LegalDecision::class); }
        $this->assertTrue($attempted);
        $this->assertEngineCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->where('metadata->case_generated_document_id', $this->c['generated']->id)->count());
    }

    public function test_missing_legal_permission_is_denied_before_resource_existence_can_be_probed(): void
    {
        $this->prepared();
        $this->c['lawyer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->value('id'));
        $this->stepResponse()->assertForbidden();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => 999999, 'request_key' => $this->key]])->assertForbidden();
        $this->assertEngineCount('c001_legal_proofs', 0);
    }

    public function test_past_contributor_remains_visible_under_c001_3b_self_policy(): void
    {
        $this->prepared(); $generated = $this->c['generated'];
        $generated->update(['draft_data' => ['synthetic' => 'lawyer edit'], 'updated_by' => $this->c['lawyer']->id]);
        $this->flushHeaders(); $this->actingAs($this->c['author']);
        $generated->update(['draft_data' => ['synthetic' => 'author revision'], 'updated_by' => $this->c['author']->id]);
        // The legacy last-editor fields and hypothetical legacy ledger omit the past editor.
        $this->assertSame($this->c['author']->id, $generated->fresh()->updated_by);
        $receipt = $this->decide($this->proof());
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertSame('SELF_FINAL_APPROVAL_WITH_STEP_UP', $receipt->context['decision_mode']);
        $this->assertEngineCount('c001_legal_decisions', 1);
    }

    public function test_client_hash_and_verified_claims_are_not_accepted_as_legal_scope_truth(): void
    {
        $this->prepared();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => $this->c['generated']->id, 'request_key' => $this->key,
                'verified' => true, 'snapshot_hash' => str_repeat('a', 64)]])->assertUnprocessable();
        $this->assertEngineCount('c001_legal_proofs', 0);
    }

    public static function engineRaces(): array { return [['same_key_same_proof'],['different_keys'],['same_proof_race']]; }

    #[DataProvider('engineRaces')]
    public function test_true_independent_process_concurrency(string $scenario): void
    {
        $this->prepared(); $firstProof=$this->proof(); $firstKey=$this->key; $firstToken=$this->token;
        $secondProof=$firstProof; $secondKey=$firstKey; $secondToken=$firstToken;
        if($scenario==='different_keys'){
            // Second real B24 login, never forge a verified bearer or copy a real secret.
            $this->flushHeaders();$this->app['auth']->forgetGuards();
            $challenge=$this->postJson('/api/login',['email'=>$this->c['lawyer']->email,'password'=>self::SYNTHETIC_PASSWORD])->assertStatus(202)->json('challenge');
            $this->travel(31)->seconds();
            $secondToken=$this->postJson('/api/mfa/login',['challenge'=>$challenge,'otp'=>app(Totp::class)->code($this->secret,now()->timestamp)])->assertOk()->json('token');
            $this->token=$secondToken;$this->key='engine-'.bin2hex(random_bytes(12));
            $secondKey=$this->key;$secondProof=$this->proof();
        }
        $root=dirname(getenv('C001_ENGINE_RUN_FILE'));$files=[];$processes=[];
        foreach(['A'=>[$firstKey,$firstProof,$firstToken],'B'=>[$secondKey,$secondProof,$secondToken]] as $role=>[$key,$proof,$token]){
            $file=$root.'/race-'.$this->fixtureLabel.'-'.$role.'.enc';
            // Shared barrier base, distinct encrypted synthetic sessions. Nothing secret in process arguments/output.
            $state=['now'=>now()->toDateTimeString(),'actor'=>$this->c['lawyer']->id,'token'=>$token,
                'case'=>$this->c['case']->id,'document'=>$this->c['document']->id,'generated'=>$this->c['generated']->id,
                'key'=>$key,'proof'=>$proof,'bytes'=>$this->bytes,
                'policy'=>['issuerAdmissions'=>$this->c['policy']->issuerAdmissions,'verifications'=>$this->c['policy']->verifications,'delegations'=>$this->c['policy']->delegations,'ledgers'=>$this->c['policy']->ledgers]];
            $state['barrier']=$root.'/race-'.$this->fixtureLabel;
            file_put_contents($file,\Illuminate\Support\Facades\Crypt::encryptString(json_encode($state,JSON_THROW_ON_ERROR)));$files[$role]=$file;
        }
        foreach($files as $role=>$file){
            $process=proc_open([PHP_BINARY,__DIR__.'/concurrent-worker.php',$file,$role],
                [0=>['pipe','r'],1=>['file',$file.'.result.json','w'],2=>['file',$file.'.stderr','w']],$pipes,base_path(),null,['bypass_shell'=>true,'create_new_console'=>false]);
            $this->assertIsResource($process);fclose($pipes[0]);$processes[$role]=$process;
        }
        $results=[];
        foreach($processes as $role=>$process){
            $until=microtime(true)+40;
            do{$status=proc_get_status($process);if(!$status['running'])break;usleep(20000);}while(microtime(true)<$until);
            if($status['running']){proc_terminate($process);$this->fail('Own synthetic worker exceeded bounded wait.');}
            proc_close($process);
            $results[$role]=json_decode(file_get_contents($files[$role].'.result.json'),true,flags:JSON_THROW_ON_ERROR);
        }
        file_put_contents($root.'/race-'.$this->fixtureLabel.'-evidence.json',json_encode(['scenario'=>$scenario,'results'=>$results],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        $this->assertNotSame($results['A']['connection_id'],$results['B']['connection_id']);
        $this->assertSame('receipt',$results['A']['category']);
        $this->assertSame($scenario==='different_keys'?'http_409':'receipt',$results['B']['category']);
        $this->assertLessThan($results['A']['finished_at'],$results['B']['parent_lock_requested_at']);
        $this->assertGreaterThanOrEqual($results['A']['parent_lock_acquired_at'],$results['B']['parent_lock_requested_at']);
        $this->assertGreaterThan(200,collect($results['B']['lock_trace'])->firstWhere('table','case_files')['duration_ms']);
        if($scenario!=='different_keys')$this->assertSame($results['A']['receipt_id'],$results['B']['receipt_id']);
        $this->assertSame(1,DB::table('c001_legal_decisions')->where('case_generated_document_id',$this->c['generated']->id)->count());
        $this->assertSame(1,SecurityAuditLog::where('event','legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->count());
        $challengeIds=DB::table('c001_legal_proofs')->whereIn('id',array_unique([$firstProof,$secondProof]))->pluck('challenge_id');
        $this->assertSame(1,DB::table('authentication_challenges')->whereIn('id',$challengeIds)->whereNotNull('used_at')->count());
        $this->assertSame('approved',$this->c['generated']->fresh()->workflow_status);
        Http::assertNothingSent();
    }

    public static function authorityChangesAtCommit(): array
    { return array_map(fn($v)=>[$v],['expired_verification','revoked_verification','verifier_permission','verifier_admission','issuer_inactive','issuer_admission','expired_delegation','membership_revoke','employee_inactive']); }

    #[DataProvider('authorityChangesAtCommit')]
    public function test_authority_is_rechecked_after_proof_issuance(string $state): void
    {
        $this->prepared();$proof=$this->proof();$c=$this->c;
        switch($state){
            case 'expired_verification':$c['verification']->forceFill(['expires_at'=>now()->subSecond()])->save();break;
            case 'revoked_verification':$c['service']->revokeVerification($c['verifier'],$c['verification']);break;
            case 'verifier_permission':$c['verifier']->roles()->sole()->permissions()->detach();break;
            case 'verifier_admission':$c['policy']->verifications=[];break;
            case 'issuer_inactive':$c['issuer']->update(['is_active'=>false]);break;
            case 'issuer_admission':$c['policy']->delegations=[];break;
            case 'expired_delegation':$c['grant']->forceFill(['expires_at'=>now()->subSecond()])->save();break;
            case 'membership_revoke':DB::table('case_memberships')->where('case_file_id',$c['case']->id)->where('user_id',$c['lawyer']->id)->update(['revoked_at'=>now()]);break;
            case 'employee_inactive':$c['lawyer']->employee->update(['status'=>'inactive']);break;
        }
        $this->denied($proof);
        $challenge=DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id',$challenge)->value('used_at'));
    }

    public function test_real_engine_schema_columns_constraints_and_indexes_match_reviewed_contract(): void
    {
        $db=DB::connection()->getDatabaseName();
        $tables=['lawyer_verifications','legal_delegations','c001_version_provenance','c001_legal_proofs','c001_legal_decisions',
            'legal_delegation_issuers','account_mfa','authentication_challenges','mfa_recovery_codes','account_action_tokens'];
        $metadata=[];
        foreach(['TABLES','COLUMNS','STATISTICS','KEY_COLUMN_USAGE','REFERENTIAL_CONSTRAINTS','TRIGGERS','CHECK_CONSTRAINTS'] as $view){
            $field=match($view){'TRIGGERS'=>'TRIGGER_SCHEMA','REFERENTIAL_CONSTRAINTS','CHECK_CONSTRAINTS'=>'CONSTRAINT_SCHEMA',default=>'TABLE_SCHEMA'};
            $metadata[$view]=DB::select("SELECT * FROM information_schema.$view WHERE $field = ?",[$db]);
        }
        file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/schema-metadata-c0013c.json',json_encode($metadata,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        foreach($metadata['TABLES'] as $table)$this->assertSame('InnoDB',$table->ENGINE,$table->TABLE_NAME);
        $columns=collect($metadata['COLUMNS'])->groupBy('TABLE_NAME');
        foreach($tables as $table){
            $this->assertTrue($columns->has($table));
            $pk=collect($metadata['STATISTICS'])->where('TABLE_NAME',$table)->where('INDEX_NAME','PRIMARY')->pluck('COLUMN_NAME')->all();
            $this->assertSame([$table==='account_mfa'?'user_id':'id'],$pk);
        }
        foreach(['lawyer_verifications'=>['issued_at','expires_at'],'legal_delegations'=>['issued_at','expires_at'],
            'c001_legal_proofs'=>['issued_at','expires_at'],'c001_legal_decisions'=>['decided_at'],
            'c001_version_provenance'=>['occurred_at'],'authentication_challenges'=>['expires_at'],
            'account_action_tokens'=>['issued_at','expires_at'],'mfa_recovery_codes'=>['created_at']] as $table=>$fields){
            foreach($fields as $field){$column=$columns[$table]->firstWhere('COLUMN_NAME',$field);
                $this->assertSame('datetime',$column->DATA_TYPE);$this->assertSame('NO',$column->IS_NULLABLE);
                $this->assertNull($column->COLUMN_DEFAULT);$this->assertSame(0,(int)$column->DATETIME_PRECISION);
                $this->assertStringNotContainsString('on update',strtolower($column->EXTRA));}
        }
        foreach(['lawyer_verifications','legal_delegations','authentication_challenges','account_action_tokens'] as $table){
            foreach(['revoked_at',...($table==='authentication_challenges'||$table==='account_action_tokens'?['used_at']:[])] as $field){
                $column=$columns[$table]->firstWhere('COLUMN_NAME',$field);$this->assertSame('YES',$column->IS_NULLABLE);
                $this->assertContains($column->COLUMN_DEFAULT,[null,'NULL']);}
        }
        foreach(['lawyer_verifications'=>['evidence_digest'],'legal_delegations'=>['evidence_digest'],
            'c001_version_provenance'=>['content_hash','previous_hash','entry_hash'],
            'c001_legal_proofs'=>['context_hash'],'c001_legal_decisions'=>['context_hash'],
            'authentication_challenges'=>['secret_hash','identity_hash','scope_hash']] as $table=>$fields){
            foreach($fields as $field){$column=$columns[$table]->firstWhere('COLUMN_NAME',$field);
                $this->assertSame('char',$column->DATA_TYPE);$this->assertSame(64,(int)$column->CHARACTER_MAXIMUM_LENGTH);}
        }
        $fks=collect($metadata['KEY_COLUMN_USAGE'])->filter(fn($r)=>$r->REFERENCED_TABLE_NAME!==null);
        foreach($fks as $fk)$this->assertSame($db,$fk->REFERENCED_TABLE_SCHEMA);
        $expected=['lawyer_verifications'=>['user_id'=>'users','employee_id'=>'employees','verifier_user_id'=>'users','verifier_employee_id'=>'employees','supersedes_id'=>'lawyer_verifications'],
            'legal_delegations'=>['user_id'=>'users','employee_id'=>'employees','issuer_user_id'=>'users','issuer_employee_id'=>'employees','verification_id'=>'lawyer_verifications','issuer_verification_id'=>'lawyer_verifications','issuer_admission_id'=>'legal_delegation_issuers','case_file_id'=>'case_files','case_document_id'=>'case_documents','case_generated_document_id'=>'case_generated_documents'],
            'c001_version_provenance'=>['case_generated_document_id'=>'case_generated_documents'],
            'c001_legal_proofs'=>[], 'c001_legal_decisions'=>['case_generated_document_id'=>'case_generated_documents','proof_id'=>'c001_legal_proofs']];
        foreach($expected as $table=>$fields){
            $actual=$fks->where('TABLE_NAME',$table)->mapWithKeys(fn($r)=>[$r->COLUMN_NAME=>$r->REFERENCED_TABLE_NAME])->all();ksort($actual);ksort($fields);$this->assertSame($fields,$actual,$table);
            foreach(collect($metadata['REFERENTIAL_CONSTRAINTS'])->where('TABLE_NAME',$table) as $fk){$this->assertSame('RESTRICT',$fk->DELETE_RULE);$this->assertSame('RESTRICT',$fk->UPDATE_RULE);}
        }
        $indexes=collect($metadata['STATISTICS']);
        foreach(['c001_legal_decisions'=>[['request_key'],['case_generated_document_id'],['proof_id']],
            'c001_version_provenance'=>[['case_generated_document_id','sequence']], 'c001_legal_proofs'=>[['challenge_id']]] as $table=>$keys){
            $unique=$indexes->where('TABLE_NAME',$table)->where('NON_UNIQUE',0)->groupBy('INDEX_NAME')->map(fn($rows)=>$rows->sortBy('SEQ_IN_INDEX')->pluck('COLUMN_NAME')->all())->values()->all();
            foreach($keys as $key)$this->assertContains($key,$unique);
        }
        $this->assertSame(['user_id','case_generated_document_id','version'],$indexes->where('TABLE_NAME','legal_delegations')->where('INDEX_NAME','c001_delegation_exact_version_index')->sortBy('SEQ_IN_INDEX')->pluck('COLUMN_NAME')->all());
        $triggers=collect($metadata['TRIGGERS'])->filter(fn($r)=>str_starts_with($r->TRIGGER_NAME,'c001_'));
        $this->assertCount(19,$triggers);
        foreach($triggers as $trigger){$this->assertSame('BEFORE',$trigger->ACTION_TIMING);$this->assertStringContainsString('45000',$trigger->ACTION_STATEMENT);}
        foreach(['c001_legal_proofs','c001_legal_decisions'] as $table)$this->assertTrue(collect($metadata['CHECK_CONSTRAINTS'])->where('TABLE_NAME',$table)->contains(fn($r)=>str_contains(strtolower($r->CHECK_CLAUSE),'json_valid')));
        // No FK to ephemeral challenges: logout must retain immutable proof evidence.
        $this->assertCount(0,$fks->where('TABLE_NAME','c001_legal_proofs'));
    }

    public function test_engine_query_plan_sanity(): void
    {
        $this->prepared();$proof=$this->proof();$this->decide($proof);$g=$this->c['generated'];$a=$this->c['lawyer'];
        $lookups=[
            'verification'=>['SELECT * FROM lawyer_verifications WHERE user_id=? AND employee_id=? AND revoked_at IS NULL AND expires_at>NOW()',[$a->id,$a->employee_id]],
            'delegation'=>['SELECT * FROM legal_delegations WHERE user_id=? AND case_generated_document_id=? AND version=? AND revoked_at IS NULL',[$a->id,$g->id,$g->version]],
            'provenance'=>['SELECT * FROM c001_version_provenance WHERE case_generated_document_id=? ORDER BY sequence',[$g->id]],
            'receipt'=>['SELECT * FROM c001_legal_decisions WHERE request_key=?',[$this->key]],
            'proof'=>['SELECT * FROM c001_legal_proofs WHERE id=?',[$proof]],
            'artifacts'=>['SELECT * FROM generated_document_artifacts WHERE case_generated_document_id=? AND artifact_type=?',[$g->id,'pdf']]];
        $plans=[];foreach($lookups as $name=>[$sql,$bindings]){
            $plan=DB::select('EXPLAIN '.$sql,$bindings);$plans[$name]=$plan;
            $this->assertNotEmpty($plan);
            // const impossible (no receipt yet) is also a valid unique lookup plan.
            foreach($plan as $row)$this->assertTrue($row->key!==null || str_contains(strtolower($row->Extra??''),'no matching row'),$name.' missing usable index');
        }
        file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/query-plans-c0013c.json',json_encode($plans,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
    }

    public function test_frozen_submission_reference_and_artifact_insertion_are_denied(): void
    {
        $this->prepared();$c=$this->c;$this->flushHeaders();$this->actingAs($c['author']);
        $task=$c['case']->caseTasks()->create(['case_document_id'=>$c['document']->id,'title'=>'Fictional linked','status'=>'pending_review','priority'=>'normal']);
        $submission=$task->submissions()->create(['case_document_id'=>$c['document']->id,'case_generated_document_id'=>$c['generated']->id,'version'=>2,'source_type'=>'auto_generated','review_status'=>'pending_review',
            'filename'=>'synthetic.pdf','mime_type'=>'application/pdf','external_file_id'=>'pdf','external_url'=>'https://example.test/pdf','checksum'=>hash('sha256',$this->bytes['pdf']),'submitted_by'=>$c['author']->id,'submitted_at'=>now()]);
        $receipt=$this->decide($this->proof());
        foreach(['update','delete','insert'] as $op){
            try{
                $q=DB::table('case_task_submissions');
                if($op==='update')$q->where('id',$submission->id)->update(['review_status'=>'pending_review']);
                elseif($op==='delete')$q->where('id',$submission->id)->delete();
                else{$attrs=$submission->fresh()->getAttributes();unset($attrs['id']);$attrs['version']=99;$q->insert($attrs);}
                $this->fail('Frozen submission '.$op.' must fail.');
            }catch(QueryException $e){$this->assertSame('45000',$e->errorInfo[0]);}
        }
        $attrs=$c['generated']->artifacts()->first()->getAttributes();unset($attrs['id']);$attrs['artifact_type']='synthetic_extra';
        try{DB::table('generated_document_artifacts')->insert($attrs);$this->fail('Frozen artifact insertion must fail.');}
        catch(QueryException $e){$this->assertSame('45000',$e->errorInfo[0]);}
        $this->assertSame($receipt->id,DB::table('c001_legal_decisions')->where('case_generated_document_id',$c['generated']->id)->value('id'));
    }

    protected function attachLinkedSubmission(): void
    {
        $c=$this->c;$this->flushHeaders();$this->actingAs($c['author']);
        $task=$c['case']->caseTasks()->create(['case_document_id'=>$c['document']->id,'title'=>'Synthetic rollback task','status'=>'pending_review','priority'=>'normal']);
        $task->submissions()->create(['case_document_id'=>$c['document']->id,'case_generated_document_id'=>$c['generated']->id,
            'version'=>2,'source_type'=>'auto_generated','review_status'=>'pending_review','filename'=>'synthetic.pdf',
            'mime_type'=>'application/pdf','external_file_id'=>'pdf','external_url'=>'https://example.test/pdf',
            'checksum'=>hash('sha256',$this->bytes['pdf']),'submitted_by'=>$c['author']->id,'submitted_at'=>now()]);
    }

    public function test_storage_uniqueness_enforces_each_receipt_identity_independently(): void
    {
        $this->prepared();$receipt=$this->decide($this->proof());
        $otherGenerated=$this->c['document']->generatedDocuments()->where('version',1)->value('id');
        // Independent synthetic storage rows, not forged professional evidence or an approval path.
        $proofRow=DB::table('c001_legal_proofs')->where('id',$receipt->proof_id)->first();$copy=(array)$proofRow;unset($copy['id']);
        $copy['challenge_id']=DB::table('authentication_challenges')->max('id')+10000;
        $otherProof=DB::table('c001_legal_proofs')->insertGetId($copy);
        foreach(['request','generated','proof'] as $unique){
            $attrs=$receipt->getAttributes();unset($attrs['id']);
            $attrs['request_key']=$unique==='request'?$receipt->request_key:'synthetic-unique-'.bin2hex(random_bytes(10));
            $attrs['case_generated_document_id']=$unique==='generated'?$receipt->case_generated_document_id:$otherGenerated;
            $attrs['proof_id']=$unique==='proof'?$receipt->proof_id:$otherProof;
            try{DB::table('c001_legal_decisions')->insert($attrs);$this->fail('Each receipt uniqueness constraint must reject a duplicate: '.$unique);}
            catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);$this->assertSame(1062,$e->errorInfo[1]);}
        }
        $this->assertSame(1,DB::table('c001_legal_decisions')->where('case_document_id',$this->c['document']->id)->count());
        // An actual MariaDB FK rejects orphan provenance, without disabling foreign_key_checks.
        $row=(array)DB::table('c001_version_provenance')->where('case_generated_document_id',$this->c['generated']->id)->first();unset($row['id']);
        $row['case_generated_document_id']=DB::table('case_generated_documents')->max('id')+10000;
        try{DB::table('c001_version_provenance')->insert($row);$this->fail('Orphan provenance must fail.');}
        catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);$this->assertSame(1452,$e->errorInfo[1]);}
    }

    public function test_revoke_in_provider_preparation_gap_is_denied_by_commit_reauthorization(): void
    {
        $this->prepared();$proof=$this->proof();$revoked=false;
        $drive=Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadFileContent')->andReturnUsing(function($id)use(&$revoked){
            $this->assertSame(0,DB::transactionLevel());
            if(!$revoked){$revoked=true;$this->authorityActor($this->c['issuer'],fn()=>$this->c['service']->revokeDelegation($this->c['issuer'],$this->c['grant']));}
            return $this->bytes[$id];
        });
        $this->app->instance(GoogleDriveService::class,$drive);
        try{$this->decide($proof);$this->fail('Revocation after preparation must be reauthorized at commit.');}
        catch(HttpExceptionInterface $e){$this->assertSame(403,$e->getStatusCode());}
        $this->assertTrue($revoked);$this->assertSame('review',$this->c['generated']->fresh()->workflow_status);
        $this->assertSame(0,DB::table('c001_legal_decisions')->where('case_generated_document_id',$this->c['generated']->id)->count());
        $challenge=DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id',$challenge)->value('used_at'));
    }
}
