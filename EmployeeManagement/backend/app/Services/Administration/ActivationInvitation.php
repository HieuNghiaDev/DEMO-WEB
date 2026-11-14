<?php

namespace App\Services\Administration;

use Carbon\CarbonInterface;
use JsonSerializable;
use LogicException;
use SensitiveParameter;

/** One-time handover value. Only the dedicated delivery endpoint may extract the secret. */
final class ActivationInvitation implements JsonSerializable
{
    public function __construct(#[SensitiveParameter] private readonly string $secret, public readonly CarbonInterface $expiresAt) {}

    public function tokenForDelivery(): string
    {
        return $this->secret;
    }

    public function __debugInfo(): array
    {
        return ['token' => '[REDACTED]', 'expires_at' => $this->expiresAt->toIso8601String()];
    }

    public function jsonSerialize(): never
    {
        throw new LogicException('Activation invitations cannot be serialized into API responses.');
    }

    public function __serialize(): array
    {
        throw new LogicException('Activation invitations cannot be persisted.');
    }
}
