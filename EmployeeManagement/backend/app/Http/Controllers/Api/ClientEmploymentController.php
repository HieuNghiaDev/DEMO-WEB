<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientEmployment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClientEmploymentController extends Controller
{
    public function index(Client $client): JsonResponse
    {
        return response()->json([
            'employments' => $client->employments()->get(),
        ]);
    }

    public function store(Request $request, Client $client): JsonResponse
    {
        $employment = $client->employments()->create($this->validated($request));

        return response()->json(['employment' => $employment], 201);
    }

    public function update(Request $request, Client $client, ClientEmployment $employment): JsonResponse
    {
        $this->ensureBelongsToClient($client, $employment);
        $employment->update($this->validated($request));

        return response()->json(['employment' => $employment->fresh()]);
    }

    public function destroy(Client $client, ClientEmployment $employment): JsonResponse
    {
        $this->ensureBelongsToClient($client, $employment);
        $employment->delete();

        return response()->json(['message' => '勤務先・職歴を削除しました。']);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:255'],
            'company_address' => ['required', 'string', 'max:255'],
            'company_phone' => ['nullable', 'string', 'max:30'],
            'employment_status' => ['required', Rule::in(ClientEmployment::STATUSES)],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_current' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($data['is_current']) {
            $data['end_date'] = null;
            if ($data['employment_status'] === 'former') {
                $data['employment_status'] = 'employed';
            }
        } elseif ($data['employment_status'] === 'employed') {
            $data['employment_status'] = 'former';
        }

        return $data;
    }

    private function ensureBelongsToClient(Client $client, ClientEmployment $employment): void
    {
        abort_unless($employment->client_id === $client->id, 404);
    }
}
