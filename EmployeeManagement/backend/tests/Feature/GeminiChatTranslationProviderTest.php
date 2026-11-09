<?php

namespace Tests\Feature;

use App\Services\GeminiChatTranslationProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class GeminiChatTranslationProviderTest extends TestCase
{
    public static function phrases(): array
    {
        return [
            ['vi', 'Ngày mai tôi sẽ đến văn phòng Tamatsukuri lúc 9 giờ.', '明日は{0}時に玉造の事務所に伺います。', '明日は9時に玉造の事務所に伺います。'],
            ['ja', '明日の9時に玉造の事務所に来てもらえますか？', 'Bạn có thể đến văn phòng Tamatsukuri lúc {0} giờ sáng mai được không?', 'Bạn có thể đến văn phòng Tamatsukuri lúc 9 giờ sáng mai được không?'],
            ['ja', '労災の手続きが完了した後、損害賠償について確認してください。', 'Sau khi hoàn tất thủ tục tai nạn lao động, vui lòng xác nhận về việc bồi thường thiệt hại.', 'Sau khi hoàn tất thủ tục tai nạn lao động, vui lòng xác nhận về việc bồi thường thiệt hại.'],
            ['ja', '請求金額は110,000円です。', 'Số tiền trên hóa đơn là {0}.', 'Số tiền trên hóa đơn là 110,000円.'],
            ['ja', 'CASE-00050について確認してください。', 'Vui lòng kiểm tra {0}.', 'Vui lòng kiểm tra CASE-00050.'],
            ['ja', 'CASE-00050 の meeting は 14:30 です。', 'Cuộc họp về {0} diễn ra lúc {1}.', 'Cuộc họp về CASE-00050 diễn ra lúc 14:30.'],
            ['ja', 'はい', 'Vâng', 'Vâng'],
            ['vi', 'xin chào', 'こんにちは', 'こんにちは'],
        ];
    }

    #[DataProvider('phrases')]
    public function test_sends_one_message_and_restores_protected_values(string $source, string $original, string $template, string $expected): void
    {
        config(['chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        Http::fake(['https://generativelanguage.googleapis.com/*' => function (Request $request) use ($template) {
            preg_match_all('/THEMISKEEP[a-f0-9]+X\d+END/', $request['contents'][0]['parts'][0]['text'], $tokens);
            $translated = preg_replace_callback('/\{(\d+)\}/', fn ($match) => $tokens[0][(int) $match[1]], $template);

            return Http::response(['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => $translated]]]]]]);
        }]);

        $result = (new GeminiChatTranslationProvider)->translate($original, $source);
        $this->assertSame($original, $result[$source === 'ja' ? 'japanese_content' : 'vietnamese_content']);
        $this->assertSame($expected, $result[$source === 'ja' ? 'vietnamese_content' : 'japanese_content']);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->hasHeader('x-goog-api-key', 'synthetic-only')
            && count($request['contents']) === 1
            && str_contains($request['systemInstruction']['parts'][0]['text'], '損害賠償 = bồi thường thiệt hại'));
    }

    public function test_rejects_a_translation_that_changes_the_amount(): void
    {
        config(['chat_translation.gemini_key' => 'synthetic-only']);
        Http::preventStrayRequests();
        Http::fake(['https://generativelanguage.googleapis.com/*' => Http::response([
            'candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => 'Số tiền là 11,000円.']]]]],
        ])]);

        $this->expectException(RuntimeException::class);
        (new GeminiChatTranslationProvider)->translate('請求金額は110,000円です。', 'ja');
    }
}
