import assert from 'node:assert/strict';
import {reconcileVisitCompositionSources20 as reconcile} from './visit-composition-reconciliation-20.mjs';
const input=()=>({
 planningRows:[
 ['Audit ID','Company_UID','Status','Total audit time in hours','SCOPE_01','Duration SCOPE_01','SCOPE_02','Duration SCOPE_02'],
 ['A-1','C-1','Pending Planning','11','x','8','x','3'],
 ['A-2','C-2','Pending Planning','11','x','8','x','3'],
 ['A-3','C-3','Pending Planning','11','x','8','x',''],
 ['A-4','C-4','Accepted','11','x','8','x','3']
 ],
 obligationRows:[
 ['Obligation_ID','Company_UID','ScopeCode','Formal_Hours'],
 ['O-11','C-1','GAP',8],['O-12','C-1','GRASP',3],
 ['O-21','C-2','GAP',8],['O-22','C-2','GRASP',''],
 ['O-31','C-3','GAP',8],['O-32','C-3','GRASP',3],
 ['O-41','C-4','GAP',8],['O-42','C-4','GRASP',3]
 ],
 linkRows:[
 ['Audit_ID','Obligation_ID','Link_State'],
 ...[1,2,3,4].flatMap(a=>[['A-'+a,'O-'+a+'1','ACTIVE'],['A-'+a,'O-'+a+'2','ACTIVE']])
 ],
 configScopeRows:[['SlotKey','ScopeCode'],['SCOPE_01','GAP'],['SCOPE_02','GRASP']]
});
const actual=reconcile(input());
assert.equal(actual.readOnly,true);assert.equal(actual.writeEnabled,false);
assert.equal(actual.multiScope,4);assert.equal(actual.pendingPlanning,3);
assert.equal(actual.eligible,1);assert.equal(actual.blocked,2);
assert.equal(actual.reasons.FORMAL_HOURS_MISSING_OR_INVALID,1);
assert.equal(actual.reasons.SCOPE_DURATION_MISSING_OR_MISMATCH,1);
assert.equal(actual.statuses.ACCEPTED,1);
assert.equal(actual.requiresManualReconciliation,true);
const reject=(change,code)=>{const x=input();change(x);assert.throws(()=>reconcile(x),e=>e?.code===code,code)};
reject(x=>{x.linkRows.push(['A-1','O-12','ACTIVE'])},'COMPOSITION_RECON_ACTIVE_LINK_COLLISION');
reject(x=>{x.planningRows.push([...x.planningRows[1]])},'COMPOSITION_RECON_DUPLICATE_AUDIT_ID');
reject(x=>{x.obligationRows.push([...x.obligationRows[1]])},'COMPOSITION_RECON_DUPLICATE_OBLIGATION_ID');
reject(x=>{x.configScopeRows.push(['SCOPE_05','GAP'])},'COMPOSITION_RECON_SCOPE_CONFIG_AMBIGUOUS');
reject(x=>{x.planningRows[0][3]='Unsupported'},'COMPOSITION_RECON_MANDATORY_HEADER_MISSING');
console.log('VISIT_COMPOSITION_RECONCILIATION_20_PASS: per-visit status, two canonical anomalies, zero writes');
