<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use SensitiveParameter;

final class EmailChangeCode extends Mailable
{
    public function __construct(#[SensitiveParameter] private readonly string $code, private readonly int $minutes = 10) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'THEMIS HQ メールアドレス変更の確認');
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.email-change-code',
            text: 'mail.email-change-code-text',
            with: ['code' => $this->code, 'minutes' => $this->minutes],
        );
    }

    public function __debugInfo(): array
    {
        return ['code' => '[REDACTED]'];
    }
}
