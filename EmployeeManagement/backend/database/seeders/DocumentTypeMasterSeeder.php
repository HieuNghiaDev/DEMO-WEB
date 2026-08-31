<?php

namespace Database\Seeders;

use App\Models\DocumentType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DocumentTypeMasterSeeder extends Seeder
{
    public function run(): void
    {
        $master = json_decode(
            file_get_contents(__DIR__.'/data/document_type_master_v1.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );

        DB::transaction(function () use ($master): void {
            foreach ($master['documents'] as $document) {
                $code = $document['code'];
                unset($document['code']);

                // The source has no approved Vietnamese translation. Preserve any
                // existing translation; new rows retain the nullable DB default.
                if ($document['name_vi'] === null) {
                    unset($document['name_vi']);
                }

                DocumentType::query()->updateOrCreate(['code' => $code], $document);
            }
        });

        $this->command?->info(count($master['documents']).' official document types seeded (master v1.0).');
    }
}
