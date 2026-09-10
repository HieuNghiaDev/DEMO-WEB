<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\DocumentGenerationTemplate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class DocumentGenerationService
{
    public function activeTemplate(CaseDocument $document): ?DocumentGenerationTemplate
    {
        if (! $document->document_type_id) {
            return null;
        }

        return DocumentGenerationTemplate::query()
            ->with('documentType:id,code,name_ja')
            ->where('document_type_id', $document->document_type_id)
            ->whereHas('documentType', fn ($query) => $query->where('handling_type', 'office_generated'))
            ->where('is_active', true)
            ->orderByDesc('version')
            ->first();
    }

    /** @return array<string, string> */
    public function initialDraft(CaseDocument $document, DocumentGenerationTemplate $template): array
    {
        $document->loadMissing(['caseFile.client', 'caseFile.assignedEmployee', 'assignedEmployee']);
        $sources = [
            'client.name' => $document->caseFile?->client?->name,
            'client.address' => $document->caseFile?->client?->address,
            'case_file.title' => $document->caseFile?->title,
            'case_file.reference_number' => $document->caseFile?->reference_number,
            'case_document.assigned_employee.full_name' => $document->assignedEmployee?->full_name
                ?? $document->caseFile?->assignedEmployee?->full_name,
        ];

        $draft = [];
        foreach ($template->field_schema as $field) {
            if (! is_array($field) || ! isset($field['key']) || ! is_string($field['key'])) {
                continue;
            }
            $source = isset($field['source']) && is_string($field['source']) ? $field['source'] : null;
            $draft[$field['key']] = $source !== null && isset($sources[$source]) ? (string) $sources[$source] : '';
        }

        return $draft;
    }

    /** @param array<string, mixed> $draft @return array<string, string> */
    public function validateDraft(DocumentGenerationTemplate $template, array $draft, bool $requireCompleted): array
    {
        $fields = collect($template->field_schema)
            ->filter(fn ($field) => is_array($field) && isset($field['key']) && is_string($field['key']))
            ->values();
        $keys = $fields->pluck('key')->all();
        $unknown = array_diff(array_keys($draft), $keys);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys(
                array_map(fn ($key) => "draft_data.{$key}", $unknown),
                'この項目はテンプレートに定義されていません。'
            ));
        }

        $rules = ['draft_data' => ['required', 'array']];
        foreach ($fields as $field) {
            $key = $field['key'];
            $isRequired = $requireCompleted && ($field['required'] ?? false);
            $fieldRules = [$isRequired ? 'required' : 'present'];
            if (! $isRequired) {
                $fieldRules[] = 'nullable';
            }
            $fieldRules[] = 'string';
            $fieldRules[] = 'max:10000';
            if (($field['type'] ?? 'text') === 'date') {
                $fieldRules[] = 'date_format:Y-m-d';
            }
            $rules["draft_data.{$key}"] = $fieldRules;
        }
        Validator::make(['draft_data' => $draft], $rules)->validate();

        return $fields->mapWithKeys(fn ($field) => [$field['key'] => (string) ($draft[$field['key']] ?? '')])->all();
    }
}
