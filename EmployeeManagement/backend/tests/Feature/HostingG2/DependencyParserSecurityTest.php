<?php

namespace Tests\Feature\HostingG2;

use Composer\InstalledVersions;
use Illuminate\Support\Facades\Http;
use League\CommonMark\CommonMarkConverter;
use PhpOffice\PhpSpreadsheet\{IOFactory, Spreadsheet};
use Symfony\Component\HttpFoundation\{HeaderUtils, Request};
use Tests\Support\B21\B21TestCase;

class DependencyParserSecurityTest extends B21TestCase
{
    public function test_bounded_headers_and_compatible_security_patch_versions(): void
    {
        foreach (['laravel/framework' => '12.69.0', 'symfony/http-foundation' => '7.4.21',
            'phpoffice/phpspreadsheet' => '5.10.0', 'league/commonmark' => '2.10.2', 'symfony/yaml' => '7.4.18'] as $package => $minimum) {
            $this->assertTrue(version_compare(InstalledVersions::getVersion($package), $minimum, '>='), $package);
        }
        $this->assertSame(['foo', 'bar'], HeaderUtils::split('foo bar', ' '));
        $request = Request::create('/api/me');
        $request->headers->set('Cache-Control', 'private, max-age=60, no-store');
        $this->assertTrue($request->headers->hasCacheControlDirective('no-store'));
        $this->assertSame('60', $request->headers->getCacheControlDirective('max-age'));
        Http::assertNothingSent(); // No large/adversarial stress payload is sent to a server.
    }

    public function test_synthetic_local_workbook_round_trip_and_xml_external_entity_rejection(): void
    {
        $file = tempnam(storage_path('framework'), 'g2-workbook-');
        try {
            $sheet = new Spreadsheet(); $sheet->getActiveSheet()->setCellValue('A1', 'SYNTHETIC ONLY');
            IOFactory::createWriter($sheet, 'Xlsx')->save($file); $sheet->disconnectWorksheets();
            $loaded = IOFactory::load($file);
            $this->assertSame('SYNTHETIC ONLY', $loaded->getActiveSheet()->getCell('A1')->getValue());
            $loaded->disconnectWorksheets();
            $scanner = \PhpOffice\PhpSpreadsheet\Reader\Security\XmlScanner::getInstance(new \PhpOffice\PhpSpreadsheet\Reader\Xlsx());
            try {
                $scanner->scan('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///SYNTHETIC-NOT-A-REAL-FILE">]><x>&e;</x>');
                $this->fail('External entity declaration must be rejected before reading any resource.');
            } catch (\PhpOffice\PhpSpreadsheet\Reader\Exception) {}
        } finally { if (is_file($file)) unlink($file); }
        Http::assertNothingSent();
    }

    public function test_bounded_commonmark_rendering_escapes_raw_html(): void
    {
        $converter = new CommonMarkConverter(['html_input' => 'escape', 'allow_unsafe_links' => false]);
        $result = (string) $converter->convert("**Synthetic**\n\n<script>SYNTHETIC</script>\n\n[a](javascript:alert(1))");
        $this->assertStringContainsString('<strong>Synthetic</strong>', $result);
        $this->assertStringNotContainsString('<script>', $result);
        $this->assertStringNotContainsString('href="javascript:', $result);
        Http::assertNothingSent();
    }
}
