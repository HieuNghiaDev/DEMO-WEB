<?php

namespace App\Services\Administration;

use InvalidArgumentException;
use SensitiveParameter;

/** RFC 6238/4226 implemented using PHP HMAC; no external QR or authenticator API. */
final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public function secret(): string
    {
        $bits = '';
        foreach (str_split(random_bytes(20)) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }
        return implode('', array_map(fn ($chunk) => self::ALPHABET[bindec($chunk)], str_split($bits, 5)));
    }

    public function code(#[SensitiveParameter] string $secret, int $timestamp): string
    {
        if (preg_match('/^[A-Z2-7]{32}$/D', $secret) !== 1 || $timestamp < 0) {
            throw new InvalidArgumentException('Invalid TOTP parameters.');
        }
        $bits = '';
        foreach (str_split($secret) as $character) {
            $bits .= str_pad(decbin(strpos(self::ALPHABET, $character)), 5, '0', STR_PAD_LEFT);
        }
        $key = implode('', array_map(fn ($chunk) => chr(bindec($chunk)), str_split($bits, 8)));
        $step = intdiv($timestamp, 30);
        $counter = pack('N2', intdiv($step, 4294967296), $step % 4294967296);
        $mac = hash_hmac('sha1', $counter, $key, true);
        $offset = ord($mac[19]) & 15;
        $value = unpack('N', substr($mac, $offset, 4))[1] & 0x7fffffff;
        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    public function matchingStep(#[SensitiveParameter] string $secret, #[SensitiveParameter] string $otp, int $timestamp, int $lastStep): ?int
    {
        if (preg_match('/^[0-9]{6}$/D', $otp) !== 1) {
            return null;
        }
        $matched = null;
        $step = intdiv($timestamp, 30);
        foreach ([-1, 0, 1] as $offset) {
            $candidate = $step + $offset;
            if ($candidate < 0) {
                continue;
            }
            $equal = hash_equals($this->code($secret, $candidate * 30), $otp);
            if ($equal && $candidate > $lastStep) {
                $matched = $candidate;
            }
        }
        return $matched;
    }
}
