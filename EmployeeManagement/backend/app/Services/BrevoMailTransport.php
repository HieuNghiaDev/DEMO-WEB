<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\MessageConverter;

final class BrevoMailTransport extends AbstractTransport
{
    public function __construct(private readonly string $apiKey)
    {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        if ($this->apiKey === '') {
            throw new TransportException('BREVO_API_KEY is not configured.');
        }

        $email = MessageConverter::toEmail($message->getOriginalMessage());
        $envelope = $message->getEnvelope();
        $sender = $email->getFrom()[0] ?? $envelope->getSender();

        $payload = [
            'sender' => $this->formatAddress($sender),
            'to' => array_map([$this, 'formatAddress'], array_values($email->getTo() ?: $envelope->getRecipients())),
            'subject' => (string) $email->getSubject(),
        ];

        if ($cc = $email->getCc()) {
            $payload['cc'] = array_map([$this, 'formatAddress'], $cc);
        }

        if ($bcc = $email->getBcc()) {
            $payload['bcc'] = array_map([$this, 'formatAddress'], $bcc);
        }

        if ($replyTo = $email->getReplyTo()) {
            $payload['replyTo'] = $this->formatAddress($replyTo[0]);
        }

        $html = $email->getHtmlBody();
        if (is_string($html) && $html !== '') {
            $payload['htmlContent'] = $html;
        }

        $text = $email->getTextBody();
        if (is_string($text) && $text !== '') {
            $payload['textContent'] = $text;
        }

        $response = Http::timeout(10)
            ->withHeaders([
                'api-key' => $this->apiKey,
                'accept' => 'application/json',
            ])
            ->post('https://api.brevo.com/v3/smtp/email', $payload);

        if ($response->failed()) {
            throw new TransportException(sprintf(
                'Request to Brevo API failed (%d): %s',
                $response->status(),
                $response->body()
            ));
        }
    }

    /**
     * @return array{email: string, name?: string}
     */
    private function formatAddress(Address $address): array
    {
        $formatted = ['email' => $address->getAddress()];
        $name = trim($address->getName());
        if ($name !== '') {
            $formatted['name'] = $name;
        }

        return $formatted;
    }

    public function __toString(): string
    {
        return 'brevo';
    }
}
