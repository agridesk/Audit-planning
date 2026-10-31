import assert from 'node:assert/strict';
import {buildObligationHoursSnapshot20,validateObligationHoursSchema20,HOURS_PROVENANCE_FIELDS} from './company-scope-hours-snapshot-20.js';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';
// Phase-1 discovery regression: separate verified snapshot contract from known UID gap.
const timestamp='2026-10-31T12:00:00.000Z';
const baseline=buildObligationHoursSnapshot20({resolution:{source:'SCOPE_DEFAULT',formalHours:8,scopeVersionId:'SV-1'},now:timestamp});
assert.deepEqual(baseline,{Formal_Hours:8,Formal_Hours_Source:'SCOPE_DEFAULT',Scope_Version_ID:'SV-1',Company_Hours_Override_ID:'',Company_Hours_Override_Revision:'',Hours_Resolved_At:timestamp});
const override=buildObligationHoursSnapshot20({resolution:{source:'COMPANY_OVERRIDE',formalHours:6,scopeVersionId:'SV-2',overrideId:'OV-2',overrideRevision:'R3'},now:timestamp});
assert.equal(override.Company_Hours_Override_ID,'OV-2');
assert.equal(override.Company_Hours_Override_Revision,'R3');
assert.equal(validateObligationHoursSchema20(['Formal_Hours',...HOURS_PROVENANCE_FIELDS]),true);
assert.throws(()=>validateObligationHoursSchema20(['Formal_Hours']),/OBLIGATION_HOURS_SCHEMA_MISSING/);
assert.throws(()=>buildObligationHoursSnapshot20({resolution:{source:'COMPANY_OVERRIDE',formalHours:6,scopeVersionId:'SV-2'},now:timestamp}),/OVERRIDE_PROVENANCE_REQUIRED/);
assert.throws(()=>buildObligationHoursSnapshot20({resolution:{source:'SCOPE_DEFAULT',formalHours:8,scopeVersionId:'SV-1',overrideId:'OV-1'},now:timestamp}),/BASELINE_PROVENANCE_CONFLICT/);
assert.throws(()=>buildObligationHoursSnapshot20({resolution:{source:'SCOPE_DEFAULT',formalHours:8},now:timestamp}),/INVALID_RESOLVED_HOURS/);
// Recorded known GAP: this legacy permissions function is still email-driven.
// DO NOT equate a passing discovery test with successful UID cutover.
const visibility=v211ActorCapabilities({actorRole:'AUDITOR',actorEmail:'auditor@example.com',assignedToEmail:'auditor@example.com',status:'APPROVED'});
assert.equal(visibility.visible,true);
assert.equal(visibility.isOwnAssigned,true);
assert.equal(visibility.capabilities.canAccept,true);
const noEmail=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',assignedToUid:'AUD-1',status:'APPROVED'});
assert.equal(noEmail.visible,false,'Document known gap: UID-only permissions not yet supported by v211ActorCapabilities');
console.log('Fase 1 provenance contract: 8 checks; UID-only permission gap retained as explicit pending cutover');
