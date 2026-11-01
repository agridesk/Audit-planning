import assert from 'node:assert/strict';
import {previewSeparateVisits20 as preview} from './model-c-separate-visit-plan-20.mjs';
const args={auditId:'A',companyUid:'C',expectedRevision:'R',obligations:[{obligationId:'O1',auditId:'A',companyUid:'C',scopeCode:'GAP',linkState:'ACTIVE',requiredMinutes:480},{obligationId:'O2',auditId:'A',companyUid:'C',scopeCode:'GRASP',linkState:'ACTIVE',requiredMinutes:180}]};
const p=preview(args);assert.equal(p.visits.length,2);assert.notEqual(p.visits[0].visitId,p.visits[1].visitId);assert.deepEqual(preview(args).visits,p.visits);assert.equal(p.commitAllowed,false);
assert.throws(()=>preview({...args,obligations:[args.obligations[0],args.obligations[0]]}),/SPLIT_OBLIGATION_INVALID/);
console.log('Model C separate visit identity preview OK');
