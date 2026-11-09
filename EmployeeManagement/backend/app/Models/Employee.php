<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Arr;

class Employee extends Model
{
    use \App\Models\Concerns\GuardsAdminContinuity;
    use SoftDeletes;

    /** Business identity only. Private HR fields require an explicitly authorized projection. */
    private const SUMMARY_ATTRIBUTES = [
        'id', 'employee_code', 'full_name', 'full_name_kana', 'gender',
        'hire_date', 'office_id', 'department_id', 'position_title',
        'employment_type', 'work_email', 'avatar_path', 'avatar_updated_at',
        'status', 'created_at', 'updated_at',
    ];

    protected $hidden = [
        'avatar_data',
        'avatar_token',
    ];

    protected $fillable = [
        'employee_code',
        'full_name',
        'full_name_kana',
        'gender',
        'nationality_code',
        'date_of_birth',
        'hire_date',
        'termination_date',
        'office_id',
        'department_id',
        'position_title',
        'employment_type',
        'work_email',
        'phone',
        'avatar_path',
        'avatar_token',
        'avatar_mime_type',
        'avatar_data',
        'avatar_updated_at',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'hire_date' => 'date',
            'termination_date' => 'date',
            'avatar_updated_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updated(function (Employee $employee): void {
            if ($employee->wasChanged('status') && $employee->status !== 'active') {
                $employee->user()->first()?->revokeSessions();
                $employee->user()->first()?->revokeActivationInvites();
            }
        });
        static::deleting(function (Employee $employee): void {
            $employee->user()->first()?->revokeSessions();
            $employee->user()->first()?->revokeActivationInvites();
        });
    }

    public function attributesToArray(): array
    {
        // Also covers raw/nested Eloquent responses; new attributes are private by default.
        // Property access stays intact for explicitly authorized private projections.
        return Arr::only(parent::attributesToArray(), self::SUMMARY_ATTRIBUTES);
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function tasks()
    {
        return $this->hasMany(EmployeeTask::class);
    }

    public function assignedCaseFiles(): HasMany
    {
        return $this->hasMany(CaseFile::class, 'assigned_employee_id');
    }
}
