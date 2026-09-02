<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var array<string, string> */
    private const OFFICE_PREFIXES = [
        'THEMIS' => 'TMS',
        'CHUKA_LAW' => 'TLW',
    ];

    /**
     * Convert pre-V2 employee identities to the canonical office/year format.
     *
     * A linked user's login_id is changed only when it was an exact mirror of
     * the previous employee code. Authentication itself continues to use email.
     */
    public function up(): void
    {
        DB::transaction(function (): void {
            $officeCodes = DB::table('offices')
                ->whereIn('office_code', array_keys(self::OFFICE_PREFIXES))
                ->pluck('office_code', 'id');

            /** @var array<int, array<int, array{prefix: string, used: array<int, bool>, legacy: array<int, object>}> $states */
            $states = [];

            foreach (DB::table('employees')->orderBy('created_at')->orderBy('id')->get() as $employee) {
                $officeCode = $officeCodes[$employee->office_id] ?? null;
                $prefix = $officeCode === null ? null : self::OFFICE_PREFIXES[$officeCode] ?? null;

                if ($prefix === null) {
                    continue;
                }

                $year = Carbon::parse($employee->created_at ?? now())->year;
                $matches = [];
                $pattern = sprintf('/^%s-(\d{2})(\d{3})$/', preg_quote($prefix, '/'));

                if (preg_match($pattern, $employee->employee_code, $matches) === 1) {
                    $year = 2000 + (int) $matches[1];
                    $sequence = (int) $matches[2];
                    $states[$employee->office_id][$year]['prefix'] = $prefix;
                    $states[$employee->office_id][$year]['used'][$sequence] = true;

                    continue;
                }

                $states[$employee->office_id][$year]['prefix'] = $prefix;
                $states[$employee->office_id][$year]['legacy'][] = $employee;
            }

            foreach ($states as $officeId => $years) {
                foreach ($years as $year => $state) {
                    $sequenceRow = DB::table('employee_code_sequences')
                        ->where('office_id', $officeId)
                        ->where('sequence_year', $year)
                        ->lockForUpdate()
                        ->first();

                    $used = $state['used'] ?? [];
                    $lastSequence = max(
                        $sequenceRow?->last_sequence ?? 0,
                        $used === [] ? 0 : max(array_keys($used)),
                    );

                    foreach ($state['legacy'] ?? [] as $employee) {
                        do {
                            $lastSequence++;
                        } while (isset($used[$lastSequence]));

                        if ($lastSequence > 999) {
                            throw new RuntimeException(sprintf(
                                'Cannot backfill employee codes for office %d in %d: yearly range is exhausted.',
                                $officeId,
                                $year,
                            ));
                        }

                        $newCode = sprintf('%s-%02d%03d', $state['prefix'], $year % 100, $lastSequence);
                        $oldCode = $employee->employee_code;

                        DB::table('employees')->where('id', $employee->id)->update([
                            'employee_code' => $newCode,
                            'updated_at' => now(),
                        ]);

                        DB::table('users')
                            ->where('employee_id', $employee->id)
                            ->where('login_id', $oldCode)
                            ->update([
                                'login_id' => $newCode,
                                'updated_at' => now(),
                            ]);

                        $used[$lastSequence] = true;
                    }

                    $timestamps = [
                        'last_sequence' => $lastSequence,
                        'updated_at' => now(),
                    ];

                    if ($sequenceRow === null) {
                        DB::table('employee_code_sequences')->insert([
                            'office_id' => $officeId,
                            'sequence_year' => $year,
                            ...$timestamps,
                            'created_at' => now(),
                        ]);
                    } else {
                        DB::table('employee_code_sequences')
                            ->where('id', $sequenceRow->id)
                            ->update($timestamps);
                    }
                }
            }
        });
    }

    public function down(): void
    {
        // Historical codes cannot be reconstructed safely after normalization.
    }
};
