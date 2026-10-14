'use strict';
const assert=require('node:assert/strict');
const {enforceAmsRotationAtWrite20:gate}=require('./rotation-ams-write-integration-20');
const slots=Array.from({length:8},(_,i)=>'SCOPE_0'+(i+1));
const scopeRows=[['SlotKey','ScopeCode','Rotation_Normal_Maximum','Rotation_Applies','Rotation_Plus_One_Permitted'],...slots.map((s,i)=>[s,'CODE_'+(i+1),'3','TRUE','FALSE'])];
const header=['Company','Auditor','Status',...slots,'Audit ID','Company_UID','Date completed','Auditor_UID'];
const history=n=>[header,...Array.from({length:n},(_,i)=>['Company','auditor@example.com','Completed',...slots.map((_,j)=>j===0?'x':''),'AUD'+i,'C1','2025-01-'+String(i+1).padStart(2,'0'),'U1'])];
const args={phase:'COMMIT',companyUid:'C1',auditorUid:'U1',auditId:'NEXT',scopeKeys:['CODE_1']};
const source=n=>({scopeRows,completedRows:history(n),approvedExceptions:[]});
(async()=>{
 assert.equal((await gate({...args,loadSheets:async()=>source(2)})).decision,'ALLOW');
 await assert.rejects(gate({...args,loadSheets:async()=>source(3)}),/ROTATION_WRITE_BLOCKED/);
 await assert.rejects(gate({...args,phase:'PREASSIGN',loadSheets:async()=>source(3)}),/ROTATION_WRITE_BLOCKED/);
})().catch(e=>{console.error(e);process.exitCode=1});
