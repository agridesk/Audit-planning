import assert from 'node:assert/strict';
import {buildObligationHoursSnapshot20,validateObligationHoursSchema20,HOURS_PROVENANCE_FIELDS} from './company-scope-hours-snapshot-20.js';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';
import {resolveCompanyScopeHours20} from './company-scope-hours-resolver-20.js';
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

// Deterministic version/override snapshot chain; no production writer access.
const context={
  companyId:'COMP-1',scopeCode:'ABC',effectiveDate:'2026-10-31',
  companyScopes:[{Company_UID:'COMP-1',ScopeCode:'ABC',Active:'YES'}],
  overrides:[],
  scopeVersions:[{ScopeCode:'ABC',Status:'CURRENT',Effective_From:'2026-01-01',Hours_to_plan:'7.5',VersionId:'SV-2026'}]
};
const resolution=resolveCompanyScopeHours20(context);
assert.equal(resolution.formalHours,7.5);
const resolvedSnapshot=buildObligationHoursSnapshot20({resolution,now:timestamp});
assert.equal(resolvedSnapshot.Scope_Version_ID,'SV-2026');
assert.equal(resolvedSnapshot.Formal_Hours_Source,'SCOPE_DEFAULT');
assert.equal(resolvedSnapshot.Company_Hours_Override_ID,'');
const overrideContext={...context,overrides:[{Company_UID:'COMP-1',ScopeCode:'ABC',Status:'ACTIVE',OverrideId:'OV-2026',Revision:'2',Hours:'5',EffectiveFrom:'2026-01-01'}]};
const overrideResolution=resolveCompanyScopeHours20(overrideContext);
assert.equal(overrideResolution.formalHours,5);
const overrideSnapshot=buildObligationHoursSnapshot20({resolution:overrideResolution,now:timestamp});
assert.equal(overrideSnapshot.Scope_Version_ID,'SV-2026');
assert.equal(overrideSnapshot.Company_Hours_Override_ID,'OV-2026');
assert.equal(overrideSnapshot.Company_Hours_Override_Revision,'2');
assert.throws(()=>resolveCompanyScopeHours20({...context,overrides:[overrideContext.overrides[0],{...overrideContext.overrides[0],OverrideId:'OV-2027'}]}),/OVERLAPPING_COMPANY_OVERRIDES/);
assert.throws(()=>resolveCompanyScopeHours20({...context,scopeVersions:[]}),/SCOPE_VERSION_MISSING/);

// Staged pure-function UID ownership tests. Call-site wiring and data cutover remain OPEN.
const visibility=v211ActorCapabilities({actorRole:'AUDITOR',actorEmail:'auditor@example.com',assignedToEmail:'auditor@example.com',status:'APPROVED'});
assert.equal(visibility.visible,true);
assert.equal(visibility.isOwnAssigned,true);
assert.equal(visibility.capabilities.canAccept,true);
const noEmail=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',assignedToUid:'AUD-1',status:'APPROVED'});
assert.equal(noEmail.visible,true,'UID-only assignments must be supported in the staged helper');
assert.equal(noEmail.capabilities.canAccept,true);
const uidConflict=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',assignedToUid:'AUD-2',actorEmail:'a@example.com',assignedToEmail:'a@example.com',status:'APPROVED'});
assert.equal(uidConflict.visible,false,'Immutable UID mismatch overrides equal legacy email');
assert.equal(uidConflict.capabilities.canAccept,false);
const unresolvable=v211ActorCapabilities({actorRole:'AUDITOR',actorEmail:'a@example.com',assignedToUid:'AUD-1',status:'APPROVED'});
assert.equal(unresolvable.visible,false,'Missing actor UID fails closed for UID-scoped owner');
const historical=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',actorEmail:'current@example.com',assignedToEmail:'historical@example.com',status:'APPROVED'});
assert.equal(historical.visible,false,'No unverified historical email alias inference');

const renamed=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',assignedToUid:'AUD-1',actorEmail:'new@example.com',assignedToEmail:'old@example.com',status:'APPROVED'});
assert.equal(renamed.visible,true,'Stable UID must survive email change');
assert.equal(renamed.capabilities.canAccept,true);
const preassignment=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',preassignedToUid:'AUD-1',status:'PENDING_PLANNING',allowSelfPlanning:true,hardEligible:true});
assert.equal(preassignment.visible,true);
assert.equal(preassignment.capabilities.canPlan,true);
const mismatchedPreassignment=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',preassignedToUid:'AUD-2',actorEmail:'same@example.com',preassignedToEmail:'same@example.com',status:'PENDING_PLANNING',allowSelfPlanning:true,hardEligible:true});
assert.equal(mismatchedPreassignment.visible,false);
assert.equal(mismatchedPreassignment.capabilities.canPlan,false);
const occupiedByUid=v211ActorCapabilities({actorRole:'AUDITOR',actorUid:'AUD-1',assignedToUid:'AUD-2',status:'PENDING_PLANNING',allowSelfPlanning:true,hardEligible:true});
assert.equal(occupiedByUid.selfPlanningPool,false,'Assigned UID alone must mark planning slot occupied');
const manager=v211ActorCapabilities({actorRole:'MANAGER',status:'APPROVED',actorUid:'MGR-1',assignedToUid:'AUD-2'});
assert.equal(manager.capabilities.canAcceptOnBehalf,true,'Manager roles must not be constrained by auditor ownership');

console.log('Fase 1 provenance contract and staged UID identity policy checks passed; runtime UID cutover NOT claimed');
