import assert from 'node:assert/strict';
import {compositionLiveWriterSurfaces20,planningCutoverCompatibility20} from './planning-cutover-compatibility-20.mjs';

for(const path of [
 '/api/v1/manager/self-planning-direct',
 '/api/v1/manager/extension-obligation-command',
 '/api/v1/manager/extension-reconcile-projection',
 '/api/v1/manager/extension-direct',
 '/api/v1/planning/commit-handoff'
])assert.ok(compositionLiveWriterSurfaces20.includes(path),'Live writer missing: '+path);

const noFlag=planningCutoverCompatibility20({environment:'DEV'});
assert.equal(noFlag.ready,false);
assert.ok(noFlag.blockers.includes('FIRESTORE_ATOMIC_AUTHORITY_DISABLED'));
const allFlags={
 environment:'DEV',atomicEnabled:true,compositionEnabled:true,legacyRetired:true,
 managerOwnerShared:true,backfillParity:true,legacyWritersFrozen:true,liveWriterRouteParityVerified:true
};
assert.ok(planningCutoverCompatibility20({...allFlags,liveWriterRouteParityVerified:false}).blockers.includes('LIVE_WRITER_ROUTE_PARITY_UNVERIFIED'));
const flagsAlone=planningCutoverCompatibility20(allFlags);
assert.equal(flagsAlone.ready,false,'Flags alone cannot demonstrate writer migration');
assert.deepEqual(flagsAlone.blockers,['LIVE_WRITER_MIGRATION_INCOMPLETE']);
assert.deepEqual(flagsAlone.pendingWriterRoutes,[...compositionLiveWriterSurfaces20]);
const oneMissing=planningCutoverCompatibility20({...allFlags,
 migratedWriterPaths:compositionLiveWriterSurfaces20.filter(x=>x!=='/api/v1/manager/self-planning-direct')});
assert.deepEqual(oneMissing.pendingWriterRoutes,['/api/v1/manager/self-planning-direct']);
const verified=planningCutoverCompatibility20({...allFlags,
 migratedWriterPaths:[...compositionLiveWriterSurfaces20]});
assert.equal(verified.ready,true);
assert.equal(planningCutoverCompatibility20({...allFlags,environment:'PROD',
 migratedWriterPaths:[...compositionLiveWriterSurfaces20]}).ready,false);
console.log('Issue #87 cutover compatibility: flags cannot bypass live writer migration proof');
