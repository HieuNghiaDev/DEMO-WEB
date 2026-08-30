<?php

namespace App\Services;

use App\Models\CaseFile;
use Illuminate\Http\Request;

class CaseWorkspaceAuditService
{
    public function record(CaseFile $caseFile, Request $request, string $title, ?string $content = null, array $metadata = []): void
    {
        $caseFile->activities()->create([
            'created_by_employee_id' => $request->user()?->employee_id,
            'activity_type' => 'note',
            'channel' => 'internal',
            'title' => $title,
            'content' => $content,
            'occurred_at' => now(),
            'metadata' => $metadata ?: null,
        ]);
    }
}
