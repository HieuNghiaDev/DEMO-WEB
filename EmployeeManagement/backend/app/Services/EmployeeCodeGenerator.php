<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\EmployeeCodeSequence;
use App\Models\Office;
use Illuminate\Validation\ValidationException;

class EmployeeCodeGenerator
{
    private const OFFICE_PREFIXES = [
        'THEMIS' => 'TMS',
        'CHUKA_LAW' => 'TLW',
    ];

    /**
     * Allocate the next immutable employee identity inside the caller's transaction.
     */
    public function allocate(Office $office): string
    {
        $prefix = self::OFFICE_PREFIXES[$office->office_code] ?? null;

        if ($prefix === null) {
            throw ValidationException::withMessages([
                'office_id' => 'この事務所には社員コードの発行規則が設定されていません。',
            ]);
        }

        $year = now()->year;
        $timestamp = now();

        // The unique office/year row is created once, then locked below. INSERT IGNORE
        // lets concurrent first requests converge on the same sequence row safely.
        EmployeeCodeSequence::query()->insertOrIgnore([
            'office_id' => $office->id,
            'sequence_year' => $year,
            'last_sequence' => 0,
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ]);

        $sequence = EmployeeCodeSequence::query()
            ->where('office_id', $office->id)
            ->where('sequence_year', $year)
            ->lockForUpdate()
            ->firstOrFail();

        // Preserve existing codes. If a historical code already uses the new format,
        // the first allocation begins after it rather than colliding or renumbering it.
        $lastSequence = max($sequence->last_sequence, $this->highestExistingSequence($office->id, $prefix, $year));

        if ($lastSequence >= 999) {
            throw ValidationException::withMessages([
                'employee_code' => 'この事務所の今年度の社員コードは上限（999件）に達しました。',
            ]);
        }

        $nextSequence = $lastSequence + 1;
        $sequence->forceFill(['last_sequence' => $nextSequence])->save();

        return sprintf('%s-%02d%03d', $prefix, $year % 100, $nextSequence);
    }

    private function highestExistingSequence(int $officeId, string $prefix, int $year): int
    {
        $pattern = sprintf('/^%s-%02d(\d{3})$/', preg_quote($prefix, '/'), $year % 100);

        return Employee::withTrashed()
            ->where('office_id', $officeId)
            ->where('employee_code', 'like', sprintf('%s-%02d%%', $prefix, $year % 100))
            ->pluck('employee_code')
            ->reduce(function (int $highest, string $code) use ($pattern): int {
                return preg_match($pattern, $code, $matches) === 1
                    ? max($highest, (int) $matches[1])
                    : $highest;
            }, 0);
    }
}
