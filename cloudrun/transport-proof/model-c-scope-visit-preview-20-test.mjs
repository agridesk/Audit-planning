import assert from 'node:assert/strict';
import {previewModelCVisitComposition20} from './model-c-scope-visit-preview-20.mjs';
const obligations=[['Obligation_ID','ScopeCode','Company_UID','Formal_Hours','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To','Obligation_State'],['OB1','ABC','C1','8','2027-05-01','2027-01-01','2027-04-30','OPEN'],['OB2','GRASP','C1','3','2027-04-01','2027-02-01','2027-03-31','OPEN']];
const links=[['Audit_ID','Obligation_ID','Link_State'],['AUDIT1','OB1','ACTIVE'],['AUDIT1','OB2','ACTIVE']];
const r=previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links});
assert.equal(r.scopeCount,2);assert.deepEqual(r.compositionOptions,['TOGETHER','SEPARATELY']);assert.deepEqual(r.obligations.map(x=>x.requiredHours),['8','3']);assert.equal(r.canCommit,false);
const planningRows=[['Audit ID','Company_UID','Status'],['AUDIT1','C1','Pending Planning']];
const configScopes=[['ScopeCode','DisplayName','Recurring','Max_Offsite_Hours'],['ABC','MPS-ABC','YES','2.5'],['GRASP','GRASP','YES','0']];
const checked=previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links,planningRows,configScopes});
assert.equal(checked.sourceEvidenceReady,true);assert.equal(checked.source.sourceRows,1);
assert.equal(checked.obligations[0].maxOffsiteHours,2.5);
assert.equal(checked.obligations[1].maxOffsiteHours,0);
assert.equal(checked.obligations[0].recurring,true);
assert.equal(previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links,planningRows,configScopes:[configScopes[0],configScopes[1],[...configScopes[2].slice(0,3),'not-a-number']]}).obligations[1].maxOffsiteHours,null);
assert.match(checked.source.revision,/^PRT1-[0-9a-f]{40}$/);
assert.deepEqual(checked.missingRequiredHours,[]);assert.equal(checked.canCommit,false);
assert.throws(()=>previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links,
 planningRows:[...planningRows,planningRows[1]],configScopes}),/SOURCE_IDENTITY_CONFLICT/);
assert.throws(()=>previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links,
 planningRows,configScopes:[configScopes[0],configScopes[1]]}),/SCOPE_CATALOG_IDENTITY_CONFLICT/);
const missingHours=previewModelCVisitComposition20({auditId:'AUDIT1',obligations:
 [obligations[0],obligations[1],[...obligations[2].slice(0,3),'',...obligations[2].slice(4)]],
 links,planningRows,configScopes});
assert.equal(missingHours.sourceEvidenceReady,false);
assert.deepEqual(missingHours.missingRequiredHours,['OB2']);
assert.throws(()=>previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links:[...links,['AUDIT1','MISSING','ACTIVE']]}),/MODEL_C_PREVIEW_LINK_UNRESOLVED/);
assert.throws(()=>previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links:[...links,['AUDIT1','OB1','ACTIVE']]}),/MODEL_C_PREVIEW_DUPLICATE_ACTIVE_LINK/);
assert.throws(()=>previewModelCVisitComposition20({auditId:'AUDIT1',obligations,links:[...links,['OTHER_AUDIT','OB1','ACTIVE']]}),/MODEL_C_PREVIEW_ACTIVE_OBLIGATION_LINKED_ELSEWHERE/);
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.ok(server.includes('/api/v1/manager/model-c-visit-preview'));
assert.ok(server.includes('previewModelCVisitComposition20({auditId'));
assert.ok(server.includes('if(actor?.role!==\'manager\')'));
const grid=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
assert.ok(grid.includes('scope-preview20'));
assert.ok(grid.includes('showScopePreview20(button)'));
assert.ok(grid.includes('Together/separately planning is not yet enabled.'));
console.log('Model C scope preview OK');
