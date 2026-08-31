<?php

namespace App\Exceptions;

use RuntimeException;

// Distinguishes unsafe master planning from infrastructure/audit failures at the API boundary.
class ChecklistPlanningException extends RuntimeException {}
