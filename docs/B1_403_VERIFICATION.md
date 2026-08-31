# Phase B1 — 403 test-fixture verification

> Subsequent B2 execution was explicitly approved and completed locally.
> See [B2_LOCAL_CLEANUP_REPORT.md](B2_LOCAL_CLEANUP_REPORT.md).
> The B1 verification and pre-B2 stop below are retained as historical evidence.

Status: **B1 passed; STOP before B2.** This follow-up changes test setup only,
not production authorization. The working local database was not migrated,
seeded, cleaned, recreated or written to by this follow-up.

## Root cause

`UserFactory` originally creates `role=employee`, but no `user_roles` entries.
Manager fixtures similarly set only `role=manager`. `RequirePermission` calls
`User::hasAnyPermission()`, which resolves permissions through
`user_roles → roles → role_permissions → permissions`. A legacy role string
does not provision those links for employees/managers.

These tests use `RefreshDatabase` without permission setup. They therefore did
not reproduce provisioned production users and were stopped by middleware
before their intended attendance/task business rules. There is no evidence
that deleting case/demo records caused these errors, and no missing permission
was found in the official master. Tests now seed `RolePermissionSeeder`
explicitly and attach the selected role explicitly after creating each user.
They do not run `DatabaseSeeder` or an employee/demo seeder.

Original fixture classifications used in the table:

- **E**: active user, `role=employee`, active employee profile; zero RBAC roles
  and zero effective permissions. Corrected to official `level_2`.
- **M**: active user, `role=manager`; zero RBAC roles and zero effective
  permissions. Corrected to official `level_4`, not admin/Level 5.
- All endpoints retain `auth:sanctum`, throttle and `password.changed` gates.

## Each of the original 14 failures

Paths below include the `/api` prefix. Test names omit their `test_` prefix.

| # | Test | Endpoint blocked | Required permission / fixture | Expected production behavior and correction |
| --- | --- | --- | --- | --- |
| 1 | AttendanceAuthorizationTest: start_uses_the_authenticated_employee_instead_of_submitted_name | POST `/api/attendances/start` | `attendance.update_own`; E | Provisioned employee starts their own shift (201); submitted name cannot select another employee. Add Level 2 fixture. |
| 2 | AttendanceAuthorizationTest: employee_cannot_update_another_employees_attendance | PATCH `/api/attendances/{id}/status` | `attendance.update_own`, then ownership; E | Still 403, but must reach the ownership denial, not fail for missing RBAC. Add Level 2; retain ownership-message and unchanged-record assertions. |
| 3 | AttendanceAuthorizationTest: legacy_attendance_is_claimed_only_by_the_matching_employee | PATCH `/api/attendances/{id}/status` | `attendance.update_own`, then legacy ownership resolution; E | Unique matching employee may claim old attendance and change status (200). Add Level 2 fixture. |
| 4 | AttendanceOutsideStatusTest: outside_schedule_is_recorded_and_closed_when_employee_returns | PATCH `/api/attendances/{id}/status` | `attendance.update_own`, then ownership; E | Own outside/return transitions succeed (200), schedule retained. Add Level 2 fixture. |
| 5 | AttendanceOutsideStatusTest: employee_can_go_outside_in_the_same_minute_as_clock_in | PATCH `/api/attendances/{id}/status` | `attendance.update_own`, then ownership; E | Same-minute outside transition succeeds (200) under existing time rules. Add Level 2 fixture. |
| 6 | AttendanceOutsideStatusTest: outside_destination_is_required | PATCH `/api/attendances/{id}/status` | `attendance.update_own`, then validation; E | Missing destination remains 422, not success or permission 403. Add Level 2 fixture. |
| 7 | AttendanceOutsideStatusTest: one_shift_keeps_multiple_breaks_and_outside_periods | PATCH `/api/attendances/{id}/status` | `attendance.update_own`; E | Transitions succeed and retain every period; subsequent GET my-history/my-timeline uses `attendance.view_own`. Level 2 officially has both permissions. |
| 8 | EmployeeTaskWorkflowTest: only_manager_or_admin_can_assign_tasks | POST `/api/employees/{id}/tasks` | `task.assign`; E | Ordinary Level 2 employee must still receive 403. Correct stale controller-message expectation to the existing middleware message; assert no task/notification is created. |
| 9 | EmployeeTaskWorkflowTest: employee_can_confirm_start_and_complete_an_assigned_task | POST `/api/employees/{id}/tasks` | `task.assign`; M, then E recipient | Level 4 assigns (201); recipient Level 2 lists own tasks (`task.view_own`) and accepts/updates (`task.update`) with ownership checks. Attach the appropriate role to both fixtures. |
| 10 | EmployeeTaskWorkflowTest: manager_can_assign_a_task_with_note_and_specific_deadline | POST `/api/employees/{id}/tasks` | `task.assign`; M, then E recipient | Level 4 assigns (201); Level 2 accepts/starts own task, preserving note/deadline. Attach appropriate roles to both fixtures. |
| 11 | EmployeeTaskWorkflowTest: manager_cannot_assign_a_task_to_an_offline_employee | POST `/api/employees/{id}/tasks` | `task.assign`, then online-state check; M | Authorized Level 4 must reach the business-rule 422 for offline employee. Add Level 4; retain 422 and existing message. |
| 12 | PersonalAttendanceReportTest: report_contains_only_the_signed_in_employees_records | GET `/api/attendances/my-report` | `attendance.export_own`; E | Level 2 downloads only own report (200), retaining isolation and formula-injection assertions. Add Level 2 fixture. |
| 13 | SecurityAuditLogTest: attendance_changes_are_logged_with_the_actor | POST `/api/attendances/start`, then PATCH `/api/attendances/{id}/status` | `attendance.update_own`; E | Own shift creates/updates (201/200) and records actor/status audit. Provision helper user with Level 2. |
| 14 | WorkSessionTest: employee_registers_first_task_after_attendance_starts | POST `/api/attendances/start` | `attendance.update_own`; E | Shift creation (201) precedes work-session creation (201). Failure was at attendance start, not `/api/work-sessions`; its existing profile/ownership rules remain. Add Level 2 fixture. |

The official master already grants Level 2 own attendance view/update/export,
own task view/update, but not assignment. Level 4 has assignment rights. Level
3 also already has `task.assign`; the historical name of test #8 must not be
read as a new restriction on Level 3. No role mapping was added or changed.

## Exact files changed in this follow-up

Backend paths relative to `EmployeeManagement/backend/`:

1. `database/factories/UserFactory.php`: opt-in `withRole($name)` attaches an
   existing role using `sole()`; fails if the master is missing/ambiguous. Plain
   factory behavior remains unprivileged. No automatic permission grants.
2. `tests/Feature/AttendanceAuthorizationTest.php`: explicit master/Level 2
   setup; added negative unprovisioned-user regression. Ambiguous legacy
   attendance test now also reaches real ownership checks with Level 2.
3. `tests/Feature/AttendanceOutsideStatusTest.php`: explicit master/Level 2.
4. `tests/Feature/EmployeeTaskWorkflowTest.php`: master + Level 2/4 fixtures,
   corrected denial message, negative unprovisioned-manager regression and
   task/notification recipient-isolation regression.
5. `tests/Feature/PersonalAttendanceReportTest.php`: master + Level 2.
6. `tests/Feature/SecurityAuditLogTest.php`: master + Level 2 helper fixture.
7. `tests/Feature/WorkSessionTest.php`: master + Level 2.

Documentation: this report and a follow-up note in `V2_LOCAL_CLEANUP.md`.
Existing pending V2 changes from the preceding task were preserved.

No edits to production User authorization, middleware, routes, attendance/task/
notification controllers or `RolePermissionSeeder`. No new package or frontend
code change. No global test authentication bypass or automatic admin factory.

## Notification and negative-authorization verification

- New assignment creates exactly one notification for the recipient, not the
  manager or another employee; notification references the assigned task ID.
- Another Level 2 employee sees no foreign task/notification and receives 403
  when accepting/updating the task or marking the notification read. Task and
  notification remain unchanged; actual recipient can mark/read and accept.
- Plain employee and manager role-string fixtures with no RBAC remain denied.
- Level 2 fixture explicitly has task-update but not assignment; Level 4
  manager explicitly has assignment; neither is Level 5.
- Existing `EmployeeNotificationApiTest` and `ApprovalNotificationTest` also
  pass in the full suite. Notification endpoints require authentication and
  ownership, not a newly invented notification permission.

## Final verification

| Check | Result |
| --- | --- |
| Exact original 14 failures, rerun after all changes | **14 tests / 134 assertions PASS** |
| Full backend suite | **168 tests / 1,069 assertions PASS**, no failures/errors/risky tests |
| Scoped Pint check (the seven PHP files above) | PASS |
| Frontend `npm run build` | PASS; existing JS chunk-size advisory remains (~658 kB > 500 kB) |
| MySQL isolated target | `testing`, `127.0.0.1`, `employee_management_v2_test_20260831` |
| Isolated `migrate --force` rerun | PASS, nothing pending, 54 migrations recorded |
| Isolated `CleanV2MasterSeeder --force` rerun | PASS |
| Isolated `matters` / legacy `tasks` | absent / absent |
| Isolated `case_tasks` / `employee_tasks` | present / present |
| Isolated document_types / unique document codes | 78 / 78 |
| Isolated document_purposes | 11 |
| Isolated clients/case_files/case_documents/received_documents/case_tasks/users/employees | 0 each |

The MySQL rerun used the existing clean test DB, did not drop/recreate it, and
verified its exact environment/host/name plus absence of operational records
before executing any Artisan migration/seeding. The full PHPUnit suite ran
on SQLite `:memory:` and exercised fresh migrations there. No working database
cleanup opt-in was enabled.

JUnit outputs, ignored and not committed:

- `backups/themis-v2-20260831/b1-403-targeted.xml`
- `backups/themis-v2-20260831/b1-403-full.xml`

## Working database safety / stop

Final read-only check of `local / 127.0.0.1 / employee_management` matches all
50 prior table counts, with 53 migrations. `matters` and `tasks` are still
present there, deliberately. Backup is readable and its SHA-256 is unchanged
(`8edd52fdd2e42d02fe53e7b4d991a5fe4dd438f975e0751a7b8c6660b99291e8`).

**No B2, no local operational deletion, no working-DB migration, no Railway
deployment and no remote push.** Further B2 work requires another explicit
approval and fresh environment/backup/inventory verification.
