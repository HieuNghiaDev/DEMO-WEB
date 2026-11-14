# Interpretation Phase 1 engine integration

Opt-in test tooling, not application routes, seeders, or a deployment artifact. Requires the existing
Windows XAMPP MariaDB 10.4.32 binaries and PowerShell 7. Does not load the source `.env`, connect to
source MySQL, copy its datadir, or change its service. Source port3306 is observed through Windows only.

From the repository root:

```powershell
& ./EmployeeManagement/backend/tests/Engine/Interpretation/run-isolated.ps1 -EvidenceRoot '<private evidence directory>'
```

The runner creates a new random private directory with restricted ACL, initializes a fresh standalone
loopback MariaDB/high port, and reuses the unchanged pinned G6 structural/fixture installer. Target
admission checks exact database/port/datadir/engine/account/marker identity. It then applies **only**
the interpretation migration, checks the deliberate non-destructive `down()` rejection, and adds
explicit grants to synthetic fixtures only. No real accounts or blanket Laravel migration/seed.

HTTP integration uses the actual Laravel kernel, Sanctum and database. Concurrency workers use
different PHP processes/connections, coordinated read views and locks under REPEATABLE READ.
Denied audit mutations must rollback; no weaker security assertions or policy bypass bindings.
Each run is fresh; no implicit reset/resume. Guarded shutdown targets only the owned instance.

`router.php` is a test-only HTTP entry for browser E2E. It additionally requires a private
`web-identity.json` with the exact owned API port and frontend port, a loopback peer, and
`INTERPRETATION_PRIVATE_RUN`. Do not register it in routes or start it against a source DB.
Start a separate Vite process with VITE_API_URL pointing exclusively to that isolated API.
Use the installer's private random **synthetic** credential handover; never real credentials.
No fake API, production provider switch, source activation receipt, or external service credentials.

Migration down is **PROTECTIVE_DENY**, not a successful destructive rollback. Engine tests do not
authorize applying the schema/grants to source or widening RolePolicy's grantable ceiling.

## Persistent local permission demo (synthetic only)

`run-isolated.ps1 -Demo -EvidenceRoot <private-directory>` creates a **new** standalone admitted instance,
reuses the exact migration and G6 fixtures, adds a second synthetic coordinator, and starts a separate
Laravel HTTP/Vite pair. `-Demo` is a CLI test-runner option, never a runtime app/provider switch.
It does not copy source accounts/data or grant User10/User8. Costs/legal authority remain unavailable.

To restart an existing demo **without reseeding or changing passwords**:

```powershell
& ./EmployeeManagement/backend/tests/Engine/Interpretation/demo-services.ps1 -Action Start -RunDirectory '<existing private g6-run directory>'
```

Use `-Action Stop` to stop only its PID/config/port-verified processes. Data remains on disk. Start is
idempotent for running owned processes; unexpected listeners or config hashes fail closed. Do not run the
fresh `-Demo` provisioning command as a restart. No automatic startup/service registration is installed.
The initialization SQL directive is removed from the owned config after the first fresh initialization;
restart never replays database/user creation. API/SPA ports and the private credential file remain stable.

`DEMO_ACCOUNTS_PRIVATE.txt` in that restricted run directory contains the three presentation accounts;
do not publish it. G6's two other baseline synthetic identities are not presentation accounts.
`demo-check.php` exercises real loopback HTTP with those users, persists test operations in the separate
synthetic secondary case, logs out only its own tokens, and saves sanitized status/assertion evidence.
The main synthetic case is reserved for browser/presentation operations. See the current handover report
under docs/reviews/THEMIS_INTERPRETATION_LOCAL_DEMO.md for actual URLs and the 5–10 minute script.
