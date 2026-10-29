/** DEV Firestore planning cutover fence.
 * Any legacy HTTP writer able to change audit obligations, identity, assignment,
 * lifecycle or capacity must be migrated or blocked before enabling atomic mode.
 */
const blocked=[
 /^\/api\/v1\/manager\/extension-direct$/,
 /^\/api\/v1\/internal\/auditor\/complete-direct$/,
 /^\/api\/v1\/manager\/auditor-management\/audit\/transfer$/,
 /^\/api\/v1\/(?:manager|auditor)\/company-management\/(?:save|scopes\/(?:hours|assign|save))$/,
 /^\/api\/v1\/manager\/company-scope-hours\/backfill$/,
 /^\/api\/v1\/manager\/auditor-management\/(?:qualification\/(?:withdraw|withdraw\/cancel|save)|role\/save|identity\/save|active\/save|create|profile\/save)$/,
 /^\/api\/v1\/manager\/scopes\/(?:create|cosmetic|policy|hours-version|bootstrap-v1)$/,
 /^\/api\/v1\/internal\/dev-auditor-uid$/
];
export function enforcePlanningAtomicCutover20({enabled,method,path}){
 if(!enabled||String(method).toUpperCase()!=='POST')return;
 if(typeof path!=='string'||!path.startsWith('/'))throw Error('PLANNING_ATOMIC_PATH_INVALID');
 if(blocked.some(re=>re.test(path)))throw Error('PLANNING_ATOMIC_WRITER_NOT_MIGRATED');
}

/** Never activate a new Firestore owner beside live GAS/Sheets canonical writers. */
export function validatePlanningAtomicRuntime20({enabled,legacyWriterRetired,managerOwnerShared,backfillParityVerified,otherAuthorityEnabled}={}){
 if(!enabled)return true;
 if(otherAuthorityEnabled)throw Error('PLANNING_ATOMIC_DUAL_AUTHORITY_ENABLED');
 if(legacyWriterRetired!==true||managerOwnerShared!==true)throw Error('PLANNING_ATOMIC_LEGACY_WRITER_NOT_RETIRED');
 if(backfillParityVerified!==true)throw Error('PLANNING_ATOMIC_BACKFILL_PARITY_REQUIRED');
 return true;
}
