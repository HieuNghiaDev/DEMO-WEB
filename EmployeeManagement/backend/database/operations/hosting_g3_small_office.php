<?php

use Illuminate\Support\Facades\{DB, Schema};

/** Explicit ordered schema inventory, outside migration discovery. Caller owns target/backup/maintenance gates. */
return [
    'administration_lock' => database_path('migrations/2026_10_20_000000_create_security_administration_state.php'),
    'account_lifecycle' => database_path('proposals/review_c001_activation_prerequisites.php'),
    'mfa' => database_path('proposals/review_c001_mfa_prerequisites.php'),
    'c001_evidence' => database_path('proposals/create_c001_legal_decisions.php'),
];
