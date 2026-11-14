<?php

require __DIR__.'/context.php';
use App\Models\{CaseFile, Permission, User};
use Illuminate\Support\Facades\{DB, Schema};

[$app, $root] = interpretationEngineContext(true);
if (Schema::hasTable('interpreters') || Schema::hasTable('interpretation_requests')) throw new LogicException('Fresh extension only; never resume/reset.');
$migration = require dirname(__DIR__, 3).'/database/migrations/2026_11_01_100000_create_interpretation_management.php';
$pivotsBefore = DB::table('role_permissions')->count();
$migration->up();
if (DB::table('role_permissions')->count() !== $pivotsBefore) throw new LogicException('Migration granted authority.');
$rollbackDenied = false;
try { $migration->down(); } catch (LogicException $e) { $rollbackDenied = str_contains($e->getMessage(), 'data-preserving rollback'); }
if (!$rollbackDenied || !Schema::hasTable('interpretation_requests')) throw new LogicException('History-preserving rollback guard failed.');
$shape = [];
foreach (['interpreters','interpretation_requests'] as $table) $shape[$table] = ['columns'=>Schema::getColumns($table), 'foreign_keys'=>Schema::getForeignKeys($table), 'indexes'=>Schema::getIndexes($table)];
file_put_contents($root.'/interpretation-schema.json',json_encode(['engine'=>DB::selectOne('SELECT VERSION() version,@@tx_isolation isolation_level'), 'up'=>'PASS', 'down'=>'PROTECTIVE_DENY', 'migration_grants'=>0, 'tables'=>$shape], JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));

DB::transaction(function () {
    foreach (['STG_MANAGER'=>['view','create','update','assign','transition','cancel'], 'STG_ASSIGNED_STAFF'=>['view'], 'STG_INACTIVE_USER'=>['view']] as $label=>$actions) {
        $user = User::where('login_id',$label)->sole(); $role=$user->roles()->sole();
        foreach ($actions as $action) DB::table('role_permissions')->insert(['role_id'=>$role->id,'permission_id'=>Permission::where('name','interpretation.'.$action)->sole()->id]);
        if ($label==='STG_MANAGER') {
            $permission=Permission::firstOrCreate(['name'=>'employee.view'],['display_name'=>'Synthetic internal directory']);
            DB::table('role_permissions')->insert(['role_id'=>$role->id,'permission_id'=>$permission->id]);
        }
    }
    $original=CaseFile::where('reference_number','G6-NORMAL')->sole();
    foreach (['INT-RACE-B'=>false,'INT-CONFIDENTIAL'=>true] as $reference=>$secret) {
        $case=$original->replicate(); $case->reference_number=$reference; $case->title='SYNTHETIC INTERPRETATION '.$reference; $case->is_confidential=$secret; $case->save();
    }
});
file_put_contents($root.'/interpretation-prepared.json',json_encode(['case_id'=>CaseFile::where('reference_number','G6-NORMAL')->sole()->id,'case_b'=>CaseFile::where('reference_number','INT-RACE-B')->sole()->id,'confidential_case'=>CaseFile::where('reference_number','INT-CONFIDENTIAL')->sole()->id,'real_data'=>false],JSON_THROW_ON_ERROR));
echo "ISOLATED_INTERPRETATION_SCHEMA=PASS; ROLLBACK=PROTECTIVE_DENY; REAL_GRANTS=NONE\n";
