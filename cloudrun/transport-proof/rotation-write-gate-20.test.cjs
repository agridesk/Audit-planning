'use strict';
const assert=require('node:assert/strict');
const {enforceRotationAtWrite20:gate}=require('./rotation-write-gate-20.cjs');
const source={companyUid:'C',auditorUid:'A',scopePolicies:[{scopeKey:'S',normalMaximum:2,extensionPermitted:true}],completedAudits:[{companyUid:'C',scopeKey:'S',auditorUid:'A',status:'Completed',auditId:'1',completedAt:'2025-01-01'},{companyUid:'C',scopeKey:'S',auditorUid:'A',status:'Completed',auditId:'2',completedAt:'2026-01-01'}]};
const args={companyUid:'C',auditorUid:'A',auditId:'NEXT'};
(async()=>{
 assert.equal((await gate({...args,phase:'PREASSIGN',loadCanonical:async()=>source})).decision,'WARN');
 await assert.rejects(gate({...args,phase:'COMMIT',loadCanonical:async()=>source}),/ROTATION_WRITE_BLOCKED/);
 await assert.rejects(gate({...args,phase:'COMMIT',loadCanonical:async()=>({...source,companyUid:'OTHER'})}),/SOURCE_MISMATCH/);
 await assert.rejects(gate({...args,phase:'COMMIT',loadCanonical:async()=>({...source,scopePolicies:[]})}),/SOURCE_MISSING/);
 await assert.rejects(gate({...args,phase:'UNKNOWN',loadCanonical:async()=>source}),/PHASE_INVALID/);
 await assert.rejects(gate({...args,phase:'COMMIT',loadCanonical:null}),/CONTEXT_MISSING/);
 assert.equal((await gate({...args,phase:'COMMIT',loadCanonical:async()=>({...source,completedAudits:[]})})).decision,'ALLOW');
 console.log('7 write gate checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
