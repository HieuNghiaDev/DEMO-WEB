param(
    [ValidateSet('Tools', 'Acceptance', 'Safety', 'Compatibility', 'C001', 'C001Artifacts', 'C001Operations', 'C001Environment', 'B22', 'B22Compatibility', 'B23Pii', 'B23', 'B24', 'B25', 'B26', 'B27', 'B31', 'B32', 'B33', 'B25Compatibility', 'Diagnostics', 'Performance', 'A02', 'A024', 'A03', 'A03LegacyRed', 'A03Related', 'A03PostFull', 'A04', 'A04Related', 'A04Runtime', 'CaseWorkspace', 'Backend', 'All')][string]$Suite = 'All',
    [string]$PhpBinary = 'php',
    [string]$Filter,
    [string]$EvidenceRoot = [System.IO.Path]::GetTempPath()
)
$ErrorActionPreference = 'Stop'
$b21Backend = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$b21Evidence = Join-Path $EvidenceRoot ('b21-' + $Suite + '-' + (Get-Date -Format 'yyyyMMdd-HHmmssfff'))
New-Item -ItemType Directory -Path $b21Evidence | Out-Null
$b21Environment = @{
    APP_ENV='testing'; APP_CONFIG_CACHE=(Join-Path $b21Evidence 'no-config.php'); LARAVEL_STORAGE_PATH=(Join-Path $b21Evidence 'storage')
    APP_KEY='base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
    DB_CONNECTION='sqlite'; DB_DATABASE=':memory:'; DB_URL=''; CACHE_STORE='array'
    SESSION_DRIVER='array'; SESSION_CONNECTION='sqlite'; SESSION_TABLE='sessions'; QUEUE_CONNECTION='sync'
    MAIL_MAILER='array'; LOG_CHANNEL='null'; BCRYPT_ROUNDS='4'
    GROQ_API_KEY='SYNTHETIC-NOT-A-CREDENTIAL'; GEMINI_API_KEY='SYNTHETIC-NOT-A-CREDENTIAL'
    ANTHROPIC_API_KEY='SYNTHETIC-NOT-A-CREDENTIAL'; OPENAI_API_KEY='SYNTHETIC-NOT-A-CREDENTIAL'
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='{}'; GOOGLE_DRIVE_OAUTH_TOKEN_JSON='{}'; GOOGLE_DRIVE_OAUTH_CLIENT_JSON='{}'
    GOOGLE_DRIVE_OAUTH_TOKEN_PATH=(Join-Path $b21Evidence 'no-token.json'); GOOGLE_DRIVE_OAUTH_CLIENT_JSON_PATH=(Join-Path $b21Evidence 'no-client.json')
    HTTP_PROXY='http://127.0.0.1:9'; HTTPS_PROXY='http://127.0.0.1:9'; NO_PROXY=''
}
$b21Previous = @{}
foreach ($b21Key in $b21Environment.Keys) {
    $b21Previous[$b21Key] = [Environment]::GetEnvironmentVariable($b21Key, 'Process')
    [Environment]::SetEnvironmentVariable($b21Key, $b21Environment[$b21Key], 'Process')
}
$b21Location = Get-Location
$b21Exit = 1
try {
    foreach ($b21Folder in @('framework/views', 'framework/cache/data', 'framework/sessions', 'logs')) {
        New-Item -ItemType Directory -Path (Join-Path $env:LARAVEL_STORAGE_PATH $b21Folder) -Force | Out-Null
    }
    Set-Location -LiteralPath $b21Backend
    & $PhpBinary (Join-Path $PSScriptRoot 'security-preflight.php')
    if ($LASTEXITCODE -ne 0) { throw 'Security preflight failed; PHPUnit was not started.' }
    $b21Tools = @('tests/Feature/B21/ContractToolsTest.php')
    $b21Acceptance = @('AdminAuthorizationAcceptanceTest', 'PolicyAcceptanceTest', 'LastAdminAcceptanceTest', 'ActivationAcceptanceTest', 'SeederAcceptanceTest') |
        ForEach-Object { 'tests/Feature/B21/' + $_ + '.php' }
    $b21Acceptance += 'tests/Feature/LegacyAdminAuthoritySecurityTest.php'
    $b21Safety = @('CasePrecedentAuthorizationTest', 'EmployeeSerializationPrivacyTest', 'AccountActivitySecurityTest', 'Phase3B1SecurityTest') |
        ForEach-Object { 'tests/Feature/' + $_ + '.php' }
    $b22Paths = @('tests/Feature/B22/AdministrationSecurityTest.php')
    $b21Paths = @(switch ($Suite) {
        'Tools' { $b21Tools }
        'Acceptance' { $b21Acceptance }
        'Safety' { $b21Safety }
        'B22' { $b22Paths }
        'B23Pii' { 'tests/Feature/B23/LegacyPiiGateTest.php' }
        'B23' { 'tests/Feature/B23' }
        'B24' { 'tests/Feature/B24' }
        'B25' { 'tests/Feature/B25' }
        'B26' { 'tests/Feature/B26' }
        'B27' { 'tests/Feature/B27' }
        'B31' { 'tests/Feature/B31' }
        'B32' { 'tests/Feature/B32' }
        'B33' { 'tests/Feature/B33' }
        'C001' { 'tests/Feature/C001' }
        'C001Artifacts' { 'tests/Feature/GoogleDriveGeneratedStorageTest.php' }
        'C001Environment' { @('tests/Feature/CaseDocumentCreationApiTest.php','tests/Feature/VisaProgressApiTest.php','tests/Unit/C001WorkbookServiceTest.php') }
        'C001Operations' { @('tests/Feature/RequiredDocumentFileReviewTest.php','tests/Feature/TaskVisibilityTest.php','tests/Feature/CaseDocumentCollectionApiTest.php','tests/Feature/CaseTaskWorkflowTest.php') }
        'Diagnostics' { 'tests/Feature/LocalRequestTimingTest.php' }
        'Performance' { 'tests/Feature/OrganizationPerformanceTest.php' }
        'A02' { @('tests/Feature/CaseDocumentParentAuthorizationTest.php', 'tests/Feature/RuntimeCaseAccessTest.php', 'tests/Feature/A022') }
        'A024' { 'tests/Feature/A024' }
        'A03' { @('tests/Feature/A03', 'tests/Feature/LegacyAdminAuthoritySecurityTest.php', 'tests/Feature/B21/AdminAuthorizationAcceptanceTest.php') }
        'A03LegacyRed' { 'tests/Feature/LegacyAdminAuthoritySecurityTest.php'; 'tests/Feature/B21/AdminAuthorizationAcceptanceTest.php'; 'tests/Feature/A03' }
        'A04' { @('tests/Feature/B23/LegacyPiiGateTest.php', 'tests/Feature/A04') }
        'A04Runtime' { @('tests/Feature/B24', 'tests/Feature/RbacTest.php', 'tests/Feature/SecurityAuditLogTest.php') }
        'A04Related' { @('tests/Feature/B21', 'tests/Feature/B22', 'tests/Feature/B25', 'tests/Feature/B26', 'tests/Feature/B27', 'tests/Feature/OrganizationPerformanceTest.php', 'tests/Feature/EmployeeSerializationPrivacyTest.php', 'tests/Feature/EmployeeCreationApiTest.php', 'tests/Feature/EmployeeDeletionApiTest.php', 'tests/Feature/ProfileAvatarApiTest.php') }
        'A03PostFull' { @('tests/Feature/B21/ContractToolsTest.php', 'tests/Feature/CleanV2Test.php') }
        'A03Related' { @('tests/Feature/B27', 'tests/Feature/B25', 'tests/Feature/B26', 'tests/Feature/RbacTest.php', 'tests/Feature/CaseFileApiTest.php', 'tests/Feature/CaseWorkspaceApiTest.php', 'tests/Feature/CaseTaskWorkflowTest.php', 'tests/Feature/ApprovalManagementApiTest.php', 'tests/Feature/ApprovalNotificationTest.php') }
        'CaseWorkspace' { @('CaseFileApiTest', 'CaseWorkspaceApiTest', 'CaseIntakeWorkspacePersistenceTest', 'ClientEmploymentApiTest', 'B26/HistoryContractInvestigationTest') | ForEach-Object { 'tests/Feature/' + $_ + '.php' } }
        'Backend' { 'tests' }
        'B25Compatibility' {
            @('CleanV2Test', 'CaseDocumentInitializationApiTest', 'GoogleDriveProvisioningTest',
              'DocumentTypeMasterSeederTest', 'DocumentPurposeTest', 'CaseTypeDocumentRuleMasterSeederTest') |
                ForEach-Object { 'tests/Feature/' + $_ + '.php' }
        }
        'B22Compatibility' {
            @('AppReleaseApiTest', 'CaseIntakeWorkspacePersistenceTest', 'CaseCollectionFoundationTest',
              'AttendanceOutsideStatusTest', 'PersonalAttendanceReportTest', 'WorkSessionTest') |
                ForEach-Object { 'tests/Feature/' + $_ + '.php' }
        }
        'All' { $b21Tools + $b21Acceptance + $b21Safety + $b22Paths + @('tests/Feature/B23', 'tests/Feature/B24', 'tests/Feature/B25', 'tests/Feature/B26', 'tests/Feature/B27', 'tests/Feature/B31', 'tests/Feature/B32', 'tests/Feature/B33', 'tests/Feature/C001', 'tests/Feature/LocalRequestTimingTest.php', 'tests/Feature/OrganizationPerformanceTest.php', 'tests/Feature/A03', 'tests/Feature/A04') }
        'Compatibility' {
            @('AuthTokenTest', 'ApiSecurityTest', 'PasswordSecurityTest', 'RbacTest', 'TaskVisibilityTest',
              'RequiredDocumentFileReviewTest', 'AttendanceAuthorizationTest', 'EmployeePasswordResetApiTest', 'EmployeeDeletionApiTest',
              'ProfileAvatarApiTest', 'CaseFileApiTest', 'CaseWorkspaceApiTest', 'CaseHistoryTest', 'CaseTaskWorkflowTest',
              'CaseDocumentCollectionApiTest', 'CaseDocumentTest', 'CaseDocumentCreationApiTest', 'EmployeeCreationApiTest',
              'EmployeeTaskWorkflowTest', 'AttendanceProfileTest', 'SecurityAuditLogTest', 'EmployeePresenceApiTest',
              'EmployeeNotificationApiTest', 'ApprovalManagementApiTest', 'ApprovalNotificationTest', 'ClientEmploymentApiTest') |
                ForEach-Object { 'tests/Feature/' + $_ + '.php' }
        }
    })
    $b21Filter = @()
    if ($Suite -eq 'A03PostFull') { $b21Filter = @('--filter', 'test_conflict_is_flagged_in_a_synthetic_manifest_not_automatically_mapped|test_stale_persona_cannot_invoke_disabled_skills_or_call_provider') }
    if ($Filter) { $b21Filter = @('--filter', $Filter) }
    # Ignore project PHPUnit configuration/cache; isolation is enforced before migrations in the base test too.
    & $PhpBinary -d auto_prepend_file=vendor/autoload.php vendor/phpunit/phpunit/phpunit --no-configuration --do-not-cache-result --colors=never --log-junit (Join-Path $b21Evidence 'junit.xml') @b21Paths @b21Filter 2>&1 |
        Tee-Object -FilePath (Join-Path $b21Evidence 'phpunit.log') | Select-Object -Last 90
    $b21Exit = $LASTEXITCODE
    'PHPUNIT_EXIT=' + $b21Exit
    'EVIDENCE=' + $b21Evidence
} finally {
    Set-Location -LiteralPath $b21Location.Path
    foreach ($b21Key in $b21Previous.Keys) {
        [Environment]::SetEnvironmentVariable($b21Key, $b21Previous[$b21Key], 'Process')
    }
}
exit $b21Exit
