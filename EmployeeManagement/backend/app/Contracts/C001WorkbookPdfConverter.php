<?php

namespace App\Contracts;

interface C001WorkbookPdfConverter
{
    public function convert(string $workbookBytes): string;
}
