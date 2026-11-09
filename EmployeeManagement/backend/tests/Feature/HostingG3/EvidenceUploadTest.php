<?php

namespace Tests\Feature\HostingG3;

use App\Rules\AllowedEvidenceFile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Http, Validator};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class EvidenceUploadTest extends B21TestCase
{
    private function accepts(UploadedFile $file): bool
    {
        return Validator::make(['file'=>$file],['file'=>['required','file','max:20480',new AllowedEvidenceFile]])->passes();
    }

    public function test_supported_real_detected_pdf_and_image_content_is_accepted_without_external_calls(): void
    {
        $this->assertTrue($this->accepts(UploadedFile::fake()->createWithContent('synthetic.pdf',"%PDF-1.4\n% Synthetic only\n%%EOF")));
        $this->assertTrue($this->accepts(UploadedFile::fake()->image('synthetic.png',1,1)));
        $this->assertTrue($this->accepts(UploadedFile::fake()->image('synthetic.jpg',1,1)));
        Http::assertNothingSent();
    }

    public static function unsupported(): array { return [['evidence.zip'],['photo.heic'],['message.eml'],['message.msg'],['audio.mp3'],['video.mp4'],['application.exe'],['renamed.pdf']]; }

    #[DataProvider('unsupported')]
    public function test_unsupported_or_extension_mime_mismatched_content_is_rejected(string $name): void
    {
        $this->assertFalse($this->accepts(UploadedFile::fake()->createWithContent($name,'SYNTHETIC PLAIN TEXT')));
        Http::assertNothingSent();
    }

    public function test_client_mime_is_not_trusted_and_size_limit_is_preserved(): void
    {
        $this->assertFalse($this->accepts(UploadedFile::fake()->create('fake.pdf',1,'application/pdf')));
        $this->assertFalse($this->accepts(UploadedFile::fake()->create('large.pdf',20481,'application/pdf')));
    }

    public function test_openxml_checks_container_identity_without_extracting_or_parsing_content(): void
    {
        foreach (['docx'=>'word/document.xml','xlsx'=>'xl/workbook.xml']as$extension=>$entry) {
            $path=tempnam(storage_path('framework'),'g3-zip-');
            try {
                $zip=new \ZipArchive;$zip->open($path,\ZipArchive::CREATE|\ZipArchive::OVERWRITE);
                $zip->addFromString('[Content_Types].xml','<Types/>');$zip->addFromString($entry,'<synthetic/>');$zip->close();
                $this->assertTrue($this->accepts(UploadedFile::fake()->createWithContent('synthetic.'.$extension,file_get_contents($path))));
                $zip->open($path);$zip->deleteName($entry);$zip->close();
                $this->assertFalse($this->accepts(UploadedFile::fake()->createWithContent('mismatch.'.$extension,file_get_contents($path))));
            } finally { if(is_file($path))unlink($path); }
        }
    }

    public function test_legacy_office_containers_and_webp_are_detected_from_real_synthetic_bytes(): void
    {
        foreach(['doc'=>'WordDocument','xls'=>'Workbook']as$extension=>$stream){
            $path=tempnam(storage_path('framework'),'g3-ole-');$handle=fopen($path,'wb');
            try {
                $file=new \PhpOffice\PhpSpreadsheet\Shared\OLE\PPS\File(\PhpOffice\PhpSpreadsheet\Shared\OLE::ascToUcs($stream));
                $file->append(str_repeat("\x00",512));
                $root=new \PhpOffice\PhpSpreadsheet\Shared\OLE\PPS\Root(null,null,[$file]);$root->save($handle);fclose($handle);$handle=null;
                $this->assertTrue($this->accepts(UploadedFile::fake()->createWithContent('synthetic.'.$extension,file_get_contents($path))),$extension);
            }finally{if(is_resource($handle))fclose($handle);if(is_file($path))unlink($path);}
        }
        $path=tempnam(storage_path('framework'),'g3-webp-');$image=imagecreatetruecolor(1,1);
        try{imagewebp($image,$path);$this->assertTrue($this->accepts(UploadedFile::fake()->createWithContent('synthetic.webp',file_get_contents($path))));}
        finally{imagedestroy($image);if(is_file($path))unlink($path);}
    }
}
