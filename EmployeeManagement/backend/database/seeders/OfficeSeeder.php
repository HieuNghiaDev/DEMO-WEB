<?php

namespace Database\Seeders;

use App\Models\Office;
use Illuminate\Database\Seeder;

class OfficeSeeder extends Seeder
{
    public function run(): void
    {
        Office::updateOrCreate(
            [
                'office_code' => 'THEMIS',
            ],
            [
                'name' => 'THEMIS株式会社',
                'address' => '大阪府松原市北新町2-5-13',
                'room_image' => '/images/room.png',
                'status' => 'active',
            ]
        );

        Office::updateOrCreate(
            [
                'office_code' => 'CHUKA_LAW',
            ],
            [
                'name' => '中華総合法律事務所',
                'address' => '大阪府松原市天美東1-80-22',
                'room_image' => '/images/law-room.png',
                'status' => 'active',
            ]
        );
    }
}