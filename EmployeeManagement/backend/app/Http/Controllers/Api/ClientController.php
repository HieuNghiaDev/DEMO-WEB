<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['clients' => Client::query()->latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $client = Client::create($this->validated($request));

        return response()->json(['client' => $client], 201);
    }

    public function show(Client $client): JsonResponse
    {
        return response()->json(['client' => $client->load('caseFiles')]);
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
            'address' => ['nullable', 'string', 'max:255'], 'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'], 'nationality' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string'],
        ]);
    }
}
