<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Services\GoogleDriveProvisioningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class ClientController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['clients' => Client::query()->latest()->get()]);
    }

    public function store(Request $request, GoogleDriveProvisioningService $drive): JsonResponse
    {
        $client = Client::create($this->validated($request));

        return response()->json([
            'client' => $client,
            'drive' => $this->attemptDriveProvisioning($client, $drive),
        ], 201);
    }

    public function show(Client $client, GoogleDriveProvisioningService $drive): JsonResponse
    {
        return response()->json([
            'client' => $client->load(['caseFiles', 'employments']),
            'drive' => $drive->clientState($client),
        ]);
    }

    public function provisionDrive(Client $client, GoogleDriveProvisioningService $drive): JsonResponse
    {
        return response()->json(['drive' => $this->attemptDriveProvisioning($client, $drive)]);
    }

    public function update(Request $request, Client $client): JsonResponse
    {
        $client->update($this->validated($request, true));

        return response()->json(['client' => $client]);
    }

    public function destroy(Client $client): JsonResponse
    {
        $caseFiles = $client->caseFiles()->withTrashed()->get();

        if ($caseFiles->isNotEmpty() && ! request()->boolean('delete_case_files')) {
            return response()->json([
                'message' => 'この依頼者には案件が紐づいています。案件も含めて削除する場合は確認してください。',
                'case_files_count' => $caseFiles->count(),
            ], 409);
        }

        DB::transaction(function () use ($client, $caseFiles): void {
            $caseFiles->each->forceDelete();
            $client->forceDelete();
        });

        return response()->json(['message' => '依頼者と関連する案件を削除しました。']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'name_kana' => ['nullable', 'string', 'max:255'], 'client_type' => ['nullable', 'in:individual,corporate'],
            'birth_date' => ['nullable', 'date_format:Y-m-d'],
            'address' => ['nullable', 'string', 'max:255'], 'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'], 'nationality' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string'],
        ]);
    }

    private function attemptDriveProvisioning(Client $client, GoogleDriveProvisioningService $drive): array
    {
        try {
            $location = $drive->provisionClient($client);

            return ['status' => 'ready', 'url' => $location->external_url];
        } catch (Throwable $error) {
            Log::warning('Client Google Drive provisioning failed.', [
                'client_id' => $client->id,
                'exception' => $error::class,
            ]);

            return ['status' => 'failed', 'url' => null, 'retryable' => true];
        }
    }
}
