<?php

namespace Tests\Support\B32;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentType;
use App\Models\RehearsalDocumentReviewGrant;
use App\Models\RehearsalLawyerVerification;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\RehearsalDocumentAuthority;
use Illuminate\Support\Facades\DB;

/** Evidence admission is synthetic arrange, not a production owner/verifier service. */
trait BuildsReviewAuthorityFixtures
{
    use \Tests\Support\B31\BuildsCaseAccessFixtures { setUp as private setUpCaseAccess; }

    protected function setUp(): void
    {
        $this->setUpCaseAccess();
        $this->app->instance(RehearsalDocumentAuthority::class, new RehearsalDocumentAuthority);
    }

    protected function verified(User $lawyer): RehearsalLawyerVerification
    {
        $verifier = $this->fixtureUser('verifier-'.$lawyer->id, ['employee.verify_lawyer']);
        return DB::transaction(function () use ($lawyer, $verifier) {
            $record = RehearsalLawyerVerification::forceCreate(['user_id' => $lawyer->id, 'employee_id' => $lawyer->employee_id,
                'verifier_user_id' => $verifier->id, 'verifier_employee_id' => $verifier->employee_id,
                'evidence_source' => 'synthetic-b32', 'evidence_digest' => hash('sha256', 'synthetic-evidence-'.$lawyer->id),
                'verified_at' => now(), 'expires_at' => now()->addHours(2)]);
            SecurityAuditLog::create(['event' => 'fixture.lawyer_verified', 'outcome' => 'success', 'user_id' => $verifier->id,
                'metadata' => ['verification_id' => $record->id, 'synthetic' => true]]);
            return $record;
        });
    }

    protected function assignReview(User $reviewer, CaseFile $case, CaseDocument $document, string $source, $file, string $kind = 'internal'): RehearsalDocumentReviewGrant
    {
        $issuer = $this->reader('issuer-'.$reviewer->id.'-'.RehearsalDocumentReviewGrant::count(),
            ['document.review_internal', ...($kind === 'final' ? ['document.approve_legal'] : [])]);
        $this->member($issuer, $case, ['read', 'write', 'confidential']);
        $verification = $this->verified($issuer);
        return DB::transaction(function () use ($reviewer, $case, $document, $source, $file, $kind, $verification, $issuer) {
            $grant = RehearsalDocumentReviewGrant::forceCreate(['user_id' => $reviewer->id, 'employee_id' => $reviewer->employee_id,
            'verification_id' => $verification->id, 'case_file_id' => $case->id, 'case_document_id' => $document->id,
            'case_task_id' => $source === 'task_submission' ? $file->case_task_id : null, 'kind' => $kind,
            'source' => $source, 'file_id' => $file->id, 'version' => $file->version,
            'evidence_digest' => hash('sha256', 'synthetic-exact-review'), 'expires_at' => now()->addMinutes(30)]);
            SecurityAuditLog::create(['event' => 'fixture.review_granted', 'outcome' => 'success', 'user_id' => $issuer->id,
                'metadata' => ['grant_id' => $grant->id, 'synthetic' => true]]);
            return $grant;
        });
    }

    protected function generated(CaseDocument $document, User $author): CaseGeneratedDocument
    {
        $type = DocumentType::firstOrCreate(['code' => 'B32'], ['name_ja' => 'Synthetic legal', 'document_group' => 'C', 'handling_type' => 'office_generated']);
        $document->update(['document_type_id' => $type->id]);
        $template = DocumentGenerationTemplate::firstOrCreate(['document_type_id' => $type->id, 'version' => 1],
            ['renderer_type' => 'generic_legal_document', 'format' => 'html', 'template_body' => '<article>synthetic</article>', 'field_schema' => [], 'is_active' => true]);
        return $document->generatedDocuments()->create(['document_generation_template_id' => $template->id, 'version' => 1,
            'workflow_status' => 'review', 'draft_data' => [], 'created_by' => $author->id, 'updated_by' => $author->id]);
    }
}
