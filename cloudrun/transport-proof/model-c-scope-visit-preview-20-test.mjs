import assert from 'node:assert/strict';
import {previewModelCVisitComposition20} from './model-c-scope-visit-preview-20.mjs';
const obligations=[['Obligation_ID','ScopeCode','Company_UID','Formal_Hours','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To','Obligation_State'],['OB1','ABC','C1','8','2027-05-01','2027-01-01','2027-04-30','OPEN'],['OB2','GRASP','C1','3','2027-04-01','2027-02-01','2027-03-31','OPEN']];
const links=[['Audit_ID','Obligation_ID','Link_State'],['AUDIT1','OB1','ACTIVE'],['AUDIT1','OB2','ACTIVE']];
const r=previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links});
assert.equal(r.scopeCount,2);assert.deepEqual(r.compositionOptions,['TOGETHER','SEPARATELY']);assert.deepEqual(r.obligations.map(x=>x.requiredHours),['8','3']);assert.equal(r.canCommit,false);
assert.throws(()=>previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links:[...links,['AUDIT1','MISSING','ACTIVE']]}),/MODEL_C_PREVIEW_LINK_UNRESOLVED/);
console.log('Model C scope preview OK');
