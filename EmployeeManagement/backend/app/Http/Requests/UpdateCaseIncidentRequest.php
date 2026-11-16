<?php

namespace App\Http\Requests;

use App\Services\CaseOperationalAccess;
use Illuminate\Foundation\Http\FormRequest;

class UpdateCaseIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return CaseOperationalAccess::capabilities($this->user(), $this->route('caseFile')->id)['edit_overview'];
    }

    public function rules(): array
    {
        return [
            'incident_summary' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'occurred_at' => ['sometimes', 'nullable', 'date'],
            'injury_details' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'incident_location' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'current_status_memo' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
}
