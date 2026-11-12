/** DEV Firestore planning cutover fence.
 * Any legacy HTTP writer able to change audit obligations, identity, assignment,
 * lifecycle or capacity must be migrated or blocked before enabling atomic mode.
 */
import {compositionLiveWriterSurfaces20} from './planning-cutover-compatibility-20.mjs';

// These endpoints already dispatch to the atomic owner inside R15 when
// atomic mode is enabled. They must remain operational, not fall through to
// the legacy proxy. Other inventoried routes remain explicitly blocked.
export const planningAtomicOwnedHttpRoutes20=Object.freeze([
 '/api/v1/manager/approve-direct',
 '/api/v1/manager/accept-direct',
 '/api/v1/manager/reject-direct',
 '/api/v1/manager/cancel-direct',
 '/api/v1/manager/complete-direct',
 '/api/v1/manager/action',
 '/api/v1/auditor/action',
 '/api/v1/manager/auditor-management/audit/transfer',
 '/api/v1/planning/commit-handoff',
 '/api/v1/manager/self-planning-direct',
 '/api/v1/manager/extension-obligation-command',
 '/api/v1/internal/auditor/complete-direct',
 '/api/v1/manager/company-management/save',
 '/api/v1/auditor/company-management/save',
 '/api/v1/manager/auditor-management/profile/save',
 '/api/v1/manager/scopes/cosmetic'
]);

// These administrative writers still share company, scope, auditor or
// audit identity authority. They are deliberately *not* declared migrated.
// Atomic cutover would block them; the release gate must report that fact.
export const planningAtomicRetiredManagementRoutes20=Object.freeze([
 '/api/v1/manager/auditor-identity/firestore-write-probe',
 '/api/v1/internal/dev-auditor-uid',
 '/api/v1/manager/company-scope-hours/backfill',
 '/api/v1/manager/scopes/bootstrap-v1'
]);
// The above are one-off DEV diagnostics/bootstrap, not live business writes.
export const planningAtomicDeferredManagementRoutes20=Object.freeze([
 '/api/v1/manager/scopes/scheme-version',
 '/api/v1/manager/company-management/scopes/hours',
 '/api/v1/manager/company-management/scopes/assign',
 '/api/v1/manager/company-management/scopes/save',
 '/api/v1/manager/auditor-management/qualification/withdraw',
 '/api/v1/manager/auditor-management/qualification/withdraw/cancel',
 '/api/v1/manager/auditor-management/qualification/save',
 '/api/v1/manager/auditor-management/role/save',
 '/api/v1/manager/auditor-management/identity/save',
 '/api/v1/manager/auditor-management/active/save',
 '/api/v1/manager/auditor-management/create',
 '/api/v1/manager/scopes/create',
 '/api/v1/manager/scopes/policy',
 '/api/v1/manager/scopes/hours-version',
]);

// Static source classification only. Operational release STILL requires
// verified frozen legacy writers, backfill, live route parity and E2E evidence.
export const planningAtomicRetiredHttpRoutes20=Object.freeze([
 '/api/v1/manager/extension',
 '/api/v1/manager/extension-direct',
 '/api/v1/manager/extension-reconcile-projection'
]);
export function classifiedPlanningCutoverPaths20(){
 const owned=new Set(planningAtomicOwnedHttpRoutes20);
 const retired=new Set(planningAtomicRetiredHttpRoutes20);
 if([...owned].some(path=>retired.has(path)))
  throw Error('PLANNING_ATOMIC_ROUTE_OWNERSHIP_AMBIGUOUS');
 const unclassified=compositionLiveWriterSurfaces20.filter(path=>!owned.has(path)&&!retired.has(path));
 if(unclassified.length)throw Error('PLANNING_ATOMIC_UNCLASSIFIED_LEGACY_WRITERS');
 return [...compositionLiveWriterSurfaces20];
}

const blocked=[
 /^\/api\/v1\/manager\/extension-direct$/,
 // Issue #87: these live DEV writers mutate the same planning/obligation
 // authority and must be migrated under the shared gate before cutover.
 /^\/api\/v1\/manager\/self-planning-direct$/,
 /^\/api\/v1\/manager\/extension-obligation-command$/,
 /^\/api\/v1\/manager\/extension-reconcile-projection$/,
 /^\/api\/v1\/manager\/scopes\/scheme-version$/,
 /^\/api\/v1\/manager\/auditor-identity\/firestore-write-probe$/,
 /^\/api\/v1\/internal\/auditor\/complete-direct$/,
 /^\/api\/v1\/(?:manager|auditor)\/company-management\/(?:save|scopes\/(?:hours|assign|save))$/,
 /^\/api\/v1\/manager\/company-scope-hours\/backfill$/,
 /^\/api\/v1\/manager\/auditor-management\/(?:qualification\/(?:withdraw|withdraw\/cancel|save)|role\/save|identity\/save|active\/save|create|profile\/save)$/,
 /^\/api\/v1\/manager\/scopes\/(?:create|cosmetic|policy|hours-version|bootstrap-v1)$/,
 /^\/api\/v1\/internal\/dev-auditor-uid$/
];
export function enforcePlanningAtomicCutover20({enabled,method,path}){
 if(!enabled||!['POST','PUT','PATCH','DELETE'].includes(String(method).toUpperCase()))return;
 if(typeof path!=='string'||!path.startsWith('/'))throw Error('PLANNING_ATOMIC_PATH_INVALID');
 if((planningAtomicOwnedHttpRoutes20.includes(path)&&String(method).toUpperCase()!=='POST')||
   (!planningAtomicOwnedHttpRoutes20.includes(path)&&
    (compositionLiveWriterSurfaces20.includes(path)||blocked.some(re=>re.test(path)))))
  throw Error('PLANNING_ATOMIC_WRITER_NOT_MIGRATED');
}

/** Never activate a new Firestore owner beside live GAS/Sheets canonical writers. */
export function validatePlanningAtomicRuntime20({enabled,legacyWriterRetired,managerOwnerShared,backfillParityVerified,otherAuthorityEnabled,liveWriterRouteParityVerified,deferredManagementRoutes=[]}={}){
 if(!enabled)return true;
 if(otherAuthorityEnabled)throw Error('PLANNING_ATOMIC_DUAL_AUTHORITY_ENABLED');
 if(!Array.isArray(deferredManagementRoutes)||deferredManagementRoutes.length)throw Error('PLANNING_ATOMIC_MANAGEMENT_WRITERS_NOT_MIGRATED');
 if(legacyWriterRetired!==true||managerOwnerShared!==true)throw Error('PLANNING_ATOMIC_LEGACY_WRITER_NOT_RETIRED');
 if(backfillParityVerified!==true)throw Error('PLANNING_ATOMIC_BACKFILL_PARITY_REQUIRED');
 if(liveWriterRouteParityVerified!==true)throw Error('PLANNING_ATOMIC_LIVE_WRITER_ROUTE_PARITY_REQUIRED');
 return true;
}
