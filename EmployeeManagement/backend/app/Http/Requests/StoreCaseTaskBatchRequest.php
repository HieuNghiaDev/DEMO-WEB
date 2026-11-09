<?php

namespace App\Http\Requests;

use App\Models\CaseTask;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCaseTaskBatchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('task.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'tasks' => ['required', 'array', 'min:1', 'max:100'],
            'tasks.*.case_document_id' => ['required', 'integer', 'distinct', 'exists:case_documents,id'],
            'tasks.*.assigned_employee_id' => ['required', 'integer', 'exists:employees,id'],
            'tasks.*.due_date' => ['required', 'date_format:Y-m-d'],
            'tasks.*.priority' => ['sometimes', Rule::in(CaseTask::PRIORITIES)],
            'tasks.*.note' => ['nullable', 'string', 'max:5000'],
        ];
    }

    public function messages(): array
    {
        return [
            'tasks.required' => '作成するタスクを選択してください。',
            'tasks.*.case_document_id.distinct' => '同じ必要資料を重複して選択できません。',
            'tasks.*.assigned_employee_id.required' => '各タスクの担当者を選択してください。',
            'tasks.*.due_date.required' => '各タスクの期限を設定してください。',
        ];
    }
}
