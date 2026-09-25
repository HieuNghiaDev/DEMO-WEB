<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCaseIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('case.update') ?? false;
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
