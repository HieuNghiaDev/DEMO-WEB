<?php

namespace Tests\Support\B21;

/** Proposed test/contract data only. Never registered by a production seeder/provider. */
final class AdminAContract
{
    public const ACTIVATION_ROUTE = 'api/account-activation/complete';

    public const ACTIVATION_TTL_HOURS = 24;

    public const ESSENTIAL_ADMIN_PERMISSIONS = [
        'employee.view', 'employee.create', 'employee.disable', 'employee.manage_roles', 'audit.view',
    ];

    /** Every row needs catalog/bundle/mapping approval before activation in the new model. */
    public static function permissions(): array
    {
        $rows = [];
        $add = static function (array $names, string $use, string $grant, bool $employee, string $condition) use (&$rows): void {
            foreach ($names as $name) {
                $rows[$name] = [
                    'admin_use' => $use,
                    'admin_grant' => $grant,
                    'employee_default' => $employee,
                    'condition' => $condition,
                    'enablement' => 'PENDING_OWNER_CATALOG_BUNDLE_AND_ACCOUNT_MAPPING_APPROVAL',
                ];
            }
        };
        $add(['employee.view'], 'scoped', 'ordinary_in_scope', true, 'Operational directory only; no private HR fields.');
        $add(['employee.create', 'employee.update', 'employee.disable'], 'scoped', 'ordinary_in_scope', false,
            'HR scope, work-field whitelist, protected target, required audit and continuity. update does not grant PII read.');
        $add(['employee.manage_roles'], 'scoped', 'protected_approval_only', false,
            'RolePolicy grantable ceiling + step-up; cannot give this administration power to oneself/others through ordinary grants.');
        $add(['attendance.view_own', 'attendance.update_own'], 'own', 'ordinary_in_scope', true, 'Active employee and own attendance.');
        $add(['attendance.export_own', 'task.view_own', 'task.update'], 'own', 'ordinary_in_scope', true, 'Own/assigned resource and workflow; export default still needs approval.');
        $add(['attendance.view_all', 'attendance.update_all', 'attendance.export_all'], 'no', 'protected_approval_only', false,
            'Separate HR-wide assignment and field/scope approval, not default administration.');
        $add(['task.create', 'task.assign', 'task.manage'], 'scoped', 'ordinary_in_scope', false, 'Authorized case/assignment scope; no task-private read implied.');
        $add(['task.view_all', 'task.delete'], 'no', 'protected_approval_only', false, 'Separate business permission and case/task scope approval.');
        $add(['task.review'], 'no', 'protected_approval_only', false, 'Non-document task review policy; never a shortcut to internal/legal document review.');
        $add(['case.assign', 'case.manage_access'], 'scoped', 'scope_approval_only', false,
            'Management scope must be defined first. No implicit case content read or self-membership.');
        $add(['case.view', 'case.create', 'case.update', 'case.delete'], 'no', 'scope_approval_only', false,
            'Explicit business/membership grant, including restricted-case policy; not default Admin A.');
        $add(['document.view', 'document.create', 'document.update', 'document.delete'], 'no', 'scope_approval_only', false,
            'Explicit case/document scope and workflow; not implied by account administration.');
        $add(['approval.submit', 'approval.view', 'approval.approve'], 'no', 'scope_approval_only', false,
            'General approvals only; not final legal approval, queue still needs resource authorization.');
        $add(['ai.use'], 'no', 'ordinary_in_scope', false, 'Provider/data-processing approval and fake-mode preservation.');
        $add(['developer.view', 'developer.release.manage'], 'no', 'protected_approval_only', false, 'Never granted by ordinary admin role editing.');
        $add(['employee.activation.manage'], 'scoped', 'protected_approval_only', false, 'Pending invite lifecycle only, no password/role/active-state bypass.');
        $add(['employee.reset_password'], 'no', 'protected_approval_only', false, 'Separate existing-account reset decision; not the new-account invitation flow.');
        $add(['employee.view_private'], 'no', 'protected_approval_only', false, 'Private-field read permission independent from employee.update and job title.');
        $add(['employee.verify_lawyer'], 'no', 'protected_approval_only', false, 'Owner-designated independent verifier; no self-verification.');
        $add(['document.review_internal'], 'delegation_only', 'lawyer_delegation_only', false, 'Verified lawyer or valid case delegation; Admin cannot issue lawyer delegation.');
        $add(['document.approve_legal'], 'no', 'protected_approval_only', false, 'Verified lawyer plus final-approval authority on the case; never employee delegation.');
        $add(['audit.view', 'settings.manage'], 'scoped', 'protected_approval_only', false,
            'Redacted administration audit/settings allowlist only, no case content, secrets or security bypass configuration.');
        ksort($rows);
        return $rows;
    }

    public static function adminFixturePermissions(): array
    {
        return array_keys(array_filter(self::permissions(), fn (array $row): bool => in_array($row['admin_use'], ['own', 'scoped'], true)));
    }

    public static function employeeFixturePermissions(): array
    {
        return array_keys(array_filter(self::permissions(), fn (array $row): bool => $row['employee_default']));
    }

    public static function protectedPermissions(): array
    {
        return array_keys(array_filter(self::permissions(), fn (array $row): bool => in_array($row['admin_grant'], ['protected_approval_only', 'lawyer_delegation_only'], true)));
    }

    public static function protectedRoles(): array
    {
        return ['admin', 'verified_lawyer', 'developer', 'level_5'];
    }

    public static function piiFields(): array
    {
        return ['phone', 'date_of_birth', 'nationality_code', 'termination_date'];
    }

    public static function policyAbilities(): array
    {
        return [
            'EmployeePolicy' => [
                'create' => 'employee.create + HR scope + audit; invite, not shared password',
                'updateWorkData' => 'employee.update + field whitelist; no private read',
                'viewPrivate' => 'employee.view_private + HR scope; no Level/title shortcut',
                'disable' => 'employee.disable + protected-target/last-admin guard',
                'issueInvite' => 'employee.activation.manage + pending/active lifecycle checks',
            ],
            'RolePolicy' => [
                'assign' => 'employee.manage_roles + non-self + grantable/protected-target + step-up + continuity',
                'grantPermissions' => 'effective-role impact diff; not merely actor.hasPermission',
                'delete' => 'protected system-role/last-admin guard + audit',
            ],
        ];
    }
}
