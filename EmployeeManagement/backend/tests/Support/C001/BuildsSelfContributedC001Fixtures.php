<?php

namespace Tests\Support\C001;

/** Synthetic new-owner-policy fixtures; preserves every authenticated contribution. */
trait BuildsSelfContributedC001Fixtures
{
    protected function ownVersion(string $contribution = 'editor'): void
    {
        $this->prepared(); $c = $this->c;
        $this->flushHeaders(); $this->actingAs($c['lawyer']);
        if ($contribution === 'creator') {
            $generated = $c['document']->generatedDocuments()->create([
                'document_generation_template_id' => $c['generated']->document_generation_template_id,
                'version' => 3, 'workflow_status' => 'review', 'draft_data' => ['synthetic' => 'lawyer-created'],
                'created_by' => $c['lawyer']->id, 'updated_by' => $c['lawyer']->id]);
            foreach (['source_workbook' => 'workbook', 'pdf' => 'pdf'] as $kind => $id) {
                $generated->artifacts()->create(['artifact_type' => $kind, 'storage_provider' => 'google_drive',
                    'external_file_id' => $id, 'external_url' => 'https://example.test/'.$id, 'filename' => 'synthetic.'.$id,
                    'mime_type' => 'application/octet-stream', 'checksum' => hash('sha256', $this->bytes[$id]),
                    'uploaded_by' => $c['lawyer']->id, 'uploaded_at' => now()]);
            }
            $c['policy']->ledgers[$generated->id.':3'] = [$c['lawyer']->id];
            $terms = $this->evidence(false);
            $c['policy']->delegations[$c['policy']->key($c['lawyer'], $c['issuer'], $terms, $generated)] = true;
            $this->actingAs($c['issuer']);
        $c['grant'] = $c['service']->issueDelegation($c['issuer'], $c['lawyer'], $generated, $terms);
            $c['generated'] = $generated; $this->c = $c;
        } elseif ($contribution === 'submitter') {
            $task = $c['case']->caseTasks()->create(['case_document_id' => $c['document']->id, 'title' => 'Synthetic self submission',
                'status' => 'pending_review', 'priority' => 'normal']);
            $task->submissions()->create(['case_document_id' => $c['document']->id, 'case_generated_document_id' => $c['generated']->id,
                'version' => 2, 'source_type' => 'auto_generated', 'review_status' => 'pending_review', 'filename' => 'synthetic.pdf',
                'mime_type' => 'application/pdf', 'external_file_id' => 'pdf', 'external_url' => 'https://example.test/pdf',
                'checksum' => hash('sha256', $this->bytes['pdf']), 'submitted_by' => $c['lawyer']->id, 'submitted_at' => now()]);
            $c['policy']->ledgers[$c['generated']->id.':2'][] = $c['lawyer']->id;
        } else {
            $c['generated']->update(['draft_data' => ['synthetic' => 'lawyer edit'], 'updated_by' => $c['lawyer']->id]);
            $c['policy']->ledgers[$c['generated']->id.':2'][] = $c['lawyer']->id;
            if ($contribution === 'past_contributor') {
                $this->actingAs($c['author']);
                $c['generated']->update(['draft_data' => ['synthetic' => 'author revision'], 'updated_by' => $c['author']->id]);
            }
        }
        $this->app['auth']->forgetGuards();
        $this->withToken($this->token)->getJson('/api/me')->assertOk();
    }

}
