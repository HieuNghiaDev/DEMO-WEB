<?php

namespace App\Services;

use App\Models\CaseGeneratedDocument;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;
use Illuminate\Validation\ValidationException;

class GenericLegalDocumentRenderer
{
    public function html(CaseGeneratedDocument $document): string
    {
        $template = $document->template;
        $values = $document->approved_data;
        $values['document_name'] = $template->documentType->name_ja ?: '文書';
        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            // Parse as inert data. Never run Blade/PHP or resolve external entities.
            $dom->loadHTML('<?xml encoding="UTF-8"><html><body>'.$template->template_body.'</body></html>', LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $body = $dom->getElementsByTagName('body')->item(0);
        if (! $body) {
            throw ValidationException::withMessages(['template' => 'テンプレートを読み込めません。']);
        }

        $notice = str_contains($template->template_body, 'data-template-fields')
            ? '<p class="notice">参考出力：正式な契約本文は未収録です。</p>'
            : '';

        return '<div class="metadata">'.$this->escape($template->documentType->code)
            .' / v'.$document->version.'</div>'.$this->children($body, $values, $template->field_schema).$notice;
    }

    private function children(DOMNode $parent, array $values, array $fields): string
    {
        $html = '';
        foreach ($parent->childNodes as $node) {
            if ($node instanceof DOMText) {
                $text = preg_replace_callback('/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/', function ($match) use ($values) {
                    if (! array_key_exists($match[1], $values)) {
                        throw ValidationException::withMessages(['template' => 'テンプレートに未定義の項目があります。']);
                    }

                    return (string) $values[$match[1]];
                }, $node->nodeValue);
                $html .= nl2br($this->escape($text));
            } elseif ($node instanceof DOMElement) {
                if ($node->tagName === 'section' && $node->hasAttribute('data-template-fields')) {
                    $html .= $this->fields($fields, $values);
                } elseif (in_array($node->tagName, ['article', 'section', 'div', 'p', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'dl', 'dt', 'dd', 'br'], true)) {
                    $tag = in_array($node->tagName, ['article', 'section'], true) ? 'div' : $node->tagName;
                    // No attributes survive: no URLs, CSS imports, event handlers, images or PDF directives.
                    $html .= $tag === 'br' ? '<br>' : '<'.$tag.'>'.$this->children($node, $values, $fields).'</'.$tag.'>';
                }
            }
        }

        return $html;
    }

    private function fields(array $fields, array $values): string
    {
        $html = '';
        foreach ($fields as $field) {
            $value = (string) ($values[$field['key']] ?? '');
            $html .= '<div class="field"><div class="label">'.$this->escape($field['label']).'</div>'
                .'<div class="value">'.nl2br($this->escape($value === '' ? '—' : $value)).'</div></div>';
        }

        return $html;
    }

    private function escape(?string $value): string
    {
        return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
