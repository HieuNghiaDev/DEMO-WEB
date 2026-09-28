<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreAppReleaseRequest extends FormRequest
{
    private const NOTE_CATEGORIES = ['ui', 'new_features', 'improvements', 'bug_fixes'];

    public function authorize(): bool
    {
        return $this->user()?->hasPermission('developer.release.manage') ?? false;
    }

    public function rules(): array
    {
        $rules = [
            'release_type' => ['required', Rule::in(['patch', 'minor', 'major'])],
            'title' => ['required', 'string', 'max:160'],
            'release_notes' => ['required', 'array'],
        ];

        foreach (self::NOTE_CATEGORIES as $category) {
            $rules["release_notes.{$category}"] = ['sometimes', 'array', 'max:20'];
            $rules["release_notes.{$category}.*"] = ['required', 'string', 'max:300'];
        }

        return $rules;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $notes = $this->input('release_notes', []);
            $unknownCategories = array_diff(array_keys(is_array($notes) ? $notes : []), self::NOTE_CATEGORIES);
            $itemCount = collect($notes)->filter(fn ($items) => is_array($items))->flatten()->filter(
                fn ($item) => is_string($item) && trim($item) !== ''
            )->count();

            if ($unknownCategories !== []) {
                $validator->errors()->add('release_notes', 'リリースノートのカテゴリが正しくありません。');
            }

            if ($itemCount === 0) {
                $validator->errors()->add('release_notes', '変更内容を1件以上入力してください。');
            }
        });
    }

    public function messages(): array
    {
        return [
            'release_type.required' => '更新種類を選択してください。',
            'release_type.in' => '更新種類が正しくありません。',
            'title.required' => 'リリースタイトルを入力してください。',
            'title.max' => 'リリースタイトルは160文字以内で入力してください。',
        ];
    }
}
