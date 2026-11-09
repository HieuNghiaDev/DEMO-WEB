<?php

namespace App\Http\Requests;

use App\Rules\AllowedEvidenceFile;
use Illuminate\Foundation\Http\FormRequest;

class StoreChatMessageRequest extends FormRequest
{
    private const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'text' => ['required_without:attachments', 'nullable', 'string', 'max:2000'],
            'attachments' => ['sometimes', 'required', 'array', 'list', 'max:4'],
            'attachments.*' => ['bail', 'required', 'file', 'max:10240', new AllowedEvidenceFile],
            'client_message_id' => ['required', 'uuid'],
            'reply_to_message_id' => ['nullable', 'integer', 'min:1'],
            'mentions' => ['sometimes', 'array', 'list', 'max:10'],
            'mentions.*' => ['required', 'array:type,user_id,start,end'],
            'mentions.*.type' => ['required', 'in:user'],
            'mentions.*.user_id' => ['required', 'integer', 'min:1'],
            'mentions.*.start' => ['required', 'integer', 'min:0', 'max:4000'],
            'mentions.*.end' => ['required', 'integer', 'min:1', 'max:4000'],
            'sender_id' => ['prohibited'],
            'user_id' => ['prohibited'],
            'employee_id' => ['prohibited'],
            'office_id' => ['prohibited'],
            'room_id' => ['prohibited'],
            'chat_room_id' => ['prohibited'],
            'source_language' => ['prohibited'],
            'translation_status' => ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function ($validator): void {
            if ($validator->errors()->isNotEmpty()) return;

            $sizes = array_map(fn ($file) => $file->getSize(), $this->file('attachments', []));
            if (in_array(0, $sizes, true)) {
                $validator->errors()->add('attachments', '空のファイルは添付できません。');
            }
            if (array_sum($sizes) > self::MAX_TOTAL_BYTES) {
                $validator->errors()->add('attachments', '添付ファイルの合計は20MB以下にしてください。');
            }
        }];
    }
}
