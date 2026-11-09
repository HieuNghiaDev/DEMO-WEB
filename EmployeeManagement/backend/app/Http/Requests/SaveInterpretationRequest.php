<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveInterpretationRequest extends FormRequest
{
    public function authorize(): bool { return $this->user() !== null; }

    public function rules(): array
    {
        $create = $this->isMethod('POST');
        $rules = [
            'language' => ['required', 'string', 'max:80'],
            'work_type' => ['required', Rule::in(['consultation', 'meeting', 'court', 'phone', 'other'])],
            'mode' => ['required', Rule::in(['in_person', 'online', 'phone'])],
            'content' => ['required', 'string', 'max:3000'],
            'starts_at' => ['required', 'date', 'regex:/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/'],
            'ends_at' => ['required', 'date', 'after:starts_at', 'regex:/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/'],
            'location' => ['nullable', 'string', 'max:255'], 'notes' => ['nullable', 'string', 'max:2000'],
            'request_key' => [$create ? 'required' : 'prohibited', 'uuid'],
            'revision' => [$create ? 'prohibited' : 'required', 'integer', 'min:1'],
            'interpreter_id' => $create ? ['nullable', 'integer', 'min:1'] : ['prohibited'],
        ];
        foreach (['case_file_id', 'case_id', 'client_id', 'user_id', 'created_by_user_id', 'updated_by_user_id',
            'status', 'fee', 'cost', 'invoice_id', 'actual_minutes', 'creation_hash'] as $field) $rules[$field] = ['prohibited'];
        return $rules;
    }

    public function messages(): array
    {
        return ['*.required' => '必須項目を入力してください。', '*.max' => '入力が長すぎます。',
            '*.prohibited' => 'この項目は変更できません。', 'ends_at.after' => '終了時間は開始時間より後にしてください。',
            '*.regex' => 'タイムゾーンを含む日時を指定してください。'];
    }
}
