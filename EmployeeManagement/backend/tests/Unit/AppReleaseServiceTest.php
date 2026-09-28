<?php

namespace Tests\Unit;

use App\Services\AppReleaseService;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class AppReleaseServiceTest extends TestCase
{
    #[DataProvider('versionCases')]
    public function test_it_calculates_the_next_semantic_version(
        string $current,
        string $releaseType,
        string $expected
    ): void {
        $this->assertSame(
            $expected,
            (new AppReleaseService)->nextVersion($current, $releaseType)
        );
    }

    public static function versionCases(): array
    {
        return [
            'patch' => ['0.11.0', 'patch', '0.11.1'],
            'minor' => ['0.11.0', 'minor', '0.12.0'],
            'major' => ['0.11.0', 'major', '1.0.0'],
        ];
    }

    public function test_it_rejects_an_unknown_release_type(): void
    {
        $this->expectException(InvalidArgumentException::class);

        (new AppReleaseService)->nextVersion('0.11.0', 'manual');
    }
}
