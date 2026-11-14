<?php

namespace Tests\Engine\C0013A;

use App\Models\{User, Employee, Office, Client, CaseFile, CaseDocument, CaseMembership, DocumentType, DocumentGenerationTemplate, Permission, Role};
use Illuminate\Support\Facades\{DB, Hash, Mail};
use App\Services\C001LegalAuthority;

require_once __DIR__.'/engine-bootstrap.php';
require_once __DIR__.'/EnginePolicy.php';

/** No RefreshDatabase, seeder, real fixtures, truncate or teardown deletion. Synthetic rows are retained. */
abstract class EngineBase extends \Tests\TestCase
{
    public const SYNTHETIC_PASSWORD = 'Engine-Synthetic!Password-2026';
    protected array $engineRun;
    protected array $initialCounts;
    protected string $fixtureLabel;
    protected function setUp(): void
    {
        parent::setUp();
        $this->engineRun = c001EngineConfigure($this->app);
        $this->fixtureLabel = bin2hex(random_bytes(6));
        $this->initialCounts = [];
        foreach (['c001_legal_decisions','c001_legal_proofs','case_activities','legal_delegations','legal_delegation_issuers'] as $table) {
            if (\Illuminate\Support\Facades\Schema::hasTable($table)) $this->initialCounts[$table] = DB::table($table)->count();
        }
        Mail::fake();
    }
    protected function assertEngineCount(string $table, int $expected): void
    { $this->assertSame($expected + ($this->initialCounts[$table] ?? 0), DB::table($table)->count(), $table); }
    protected function fixtureUser(string $label, array $permissions): User
    {
        app(\App\Services\C001EngineValidationScope::class)->assertAllowed();
        $label = $this->fixtureLabel.'-'.$label;
        $office = Office::firstOrCreate(['office_code'=>'ENGINE'], ['name'=>'Synthetic engine office','status'=>'active']);
        $employee = Employee::create(['employee_code'=>'E-'.$label,'full_name'=>'Fictional '.$label,
            'office_id'=>$office->id,'hire_date'=>'2026-01-01','status'=>'active']);
        $user = User::factory()->create(['employee_id'=>$employee->id,'name'=>'Fictional '.$label,
            'email'=>$label.'@example.test','password'=>Hash::make(self::SYNTHETIC_PASSWORD),'role'=>'employee',
            'is_active'=>true,'must_change_password'=>false,'activation_required'=>false,'activated_at'=>now()]);
        $role = Role::create(['name'=>'engine-'.$label,'display_name'=>'Fictional engine role']);
        $ids = array_map(fn ($name)=>Permission::firstOrCreate(['name'=>$name],['display_name'=>'Fictional '.$name])->id,$permissions);
        // Fixture pivots only, after disposable scope verification; never grant to a real account.
        foreach ($ids as $id) DB::table('role_permissions')->insert(['role_id'=>$role->id,'permission_id'=>$id]);
        DB::table('user_roles')->insert(['role_id'=>$role->id,'user_id'=>$user->id]);
        return $user->fresh();
    }
    protected function reader(string $label, array $permissions=[]): User
    { return $this->fixtureUser($label,['case.view',...$permissions]); }
    protected function matter(): CaseFile
    { return CaseFile::forceCreate(['title'=>'Synthetic engine case','status'=>'active','is_confidential'=>true,
        'client_id'=>Client::create(['name'=>'Fictional client '.$this->fixtureLabel])->id]); }
    protected function document(CaseFile $case): CaseDocument
    { return $case->documents()->create(['title'=>'Synthetic C001','category'=>'required','necessity_status'=>'required','status'=>'not_requested']); }
    protected function member(User $user, CaseFile $case): void
    { CaseMembership::forceCreate(['case_file_id'=>$case->id,'user_id'=>$user->id,'employee_id'=>$user->employee_id,
        'can_read'=>true,'can_write'=>true,'can_read_confidential'=>true,'expires_at'=>now()->addHour(),
        'evidence_ref'=>'synthetic-engine-only','revision'=>1]); }
    protected function evidence(bool $verification=true): array
    { return ['evidence_reference'=>'synthetic:engine:'.$this->fixtureLabel,'evidence_digest'=>hash('sha256','FICTIONAL '.$this->fixtureLabel),
        'issued_at'=>now()->toImmutable(),'expires_at'=>now()->addMinutes($verification?50:20)->toImmutable(),
        ...($verification?['source'=>'synthetic-engine-admission']:['scope'=>'final'])]; }
    protected function context(): array
    {
        $policy = new EnginePolicy; $this->app->instance(\App\Contracts\C001AuthorityPolicy::class,$policy);
        $service=app(C001LegalAuthority::class);
        $verifier=$this->fixtureUser('verifier',['employee.verify_lawyer']);
        $lawyer=$this->reader('approver',['document.approve_legal']);
        $issuer=$this->reader('issuer',['document.delegate_legal']);
        $admitter=$this->fixtureUser('owner-admitter',[]);
        $author=$this->reader('contributor');
        $case=$this->matter(); $this->member($lawyer,$case); $this->member($issuer,$case);
        $type=DocumentType::firstOrCreate(['code'=>'C-001'],['name_ja'=>'Synthetic C001','document_group'=>'C','handling_type'=>'office_generated']);
        $document=$this->document($case); $document->update(['document_type_id'=>$type->id]);
        // Retained databases must not reuse a template mutated by an earlier negative scenario.
        $template=DocumentGenerationTemplate::create(['document_type_id'=>$type->id,
            'version'=>(int)DocumentGenerationTemplate::where('document_type_id',$type->id)->max('version')+1,
            'renderer_type'=>'generic_legal_document','format'=>'html',
            'template_body'=>'<article>Synthetic '.$this->fixtureLabel.'</article>','field_schema'=>[],'is_active'=>true]);
        $generated=$document->generatedDocuments()->create(['document_generation_template_id'=>$template->id,'version'=>1,
            'workflow_status'=>'review','draft_data'=>[],'created_by'=>$author->id,'updated_by'=>$author->id]);
        $evidence=$this->evidence();
        $policy->verifications[$policy->key($lawyer,$verifier,$evidence)]=true;
        $verification=$service->issueVerification($verifier,$lawyer,$evidence);
        $issuerTerms=[...$this->evidence(),'source'=>'synthetic-owner-admission','scope'=>\App\Models\LegalDelegationIssuer::SCOPE,'case_file_id'=>$case->id];
        $policy->issuerAdmissions[$policy->key($issuer,$admitter,$issuerTerms)]=true;
        $input=$issuerTerms;unset($input['case_file_id']);$this->actingAs($admitter);
        $issuerAdmission=$service->admitIssuer($admitter,$issuer,$case,$input);
        $policy->ledgers[$generated->id.':1']=[$author->id]; $terms=$this->evidence(false);
        $policy->delegations[$policy->key($lawyer,$issuer,$terms,$generated)]=true;
        $this->actingAs($issuer);
        $grant=$service->issueDelegation($issuer,$lawyer,$generated,$terms);
        return compact('policy','service','verifier','lawyer','issuer','author','case','document','generated','evidence','terms','verification','issuerAdmission','admitter','issuerTerms','grant');
    }
    protected function authorityActor(\App\Models\User $actor, callable $callback): mixed
    {
        $guard=auth()->guard();$prior=$guard->user();$resolver=request()->getUserResolver();
        $guard->setUser($actor);request()->setUserResolver(fn()=>$actor);
        try{return $callback();}finally{if($prior)$guard->setUser($prior);else $guard->forgetUser();request()->setUserResolver($resolver);}
    }
}
