/**
 * Read-only DEV migration parity checker.
 * Compares authoritative spreadsheet exports against Firestore snapshots.
 * Does not perform writes or assert cutover readiness without full coverage.
 */
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return value;
}
function digest(value){return JSON.stringify(stable(value));}
export function verifySwapFirestoreMigration({sheetAudits,firestoreAudits,sheetAvailability,firestoreAvailability,expectedAuditIds}={}){
 if(!Array.isArray(expectedAuditIds)||!expectedAuditIds.length||new Set(expectedAuditIds).size!==expectedAuditIds.length||
  !Array.isArray(sheetAudits)||!Array.isArray(firestoreAudits)||
  !Array.isArray(sheetAvailability)||!Array.isArray(firestoreAvailability))
  throw Error('SWAP_MIGRATION_INPUT_INVALID');
 const issues=[];
 const compare=(label,source,target)=>{
  const sourceMap=new Map(),targetMap=new Map();
  for(const [rows,map,side] of [[source,sourceMap,'source'],[target,targetMap,'target']]){
   for(const row of rows){
    if(!row||typeof row.auditId!=='string'||!row.auditId.trim()||map.has(row.auditId)){
     issues.push({kind:'DUPLICATE_OR_INVALID',label,side,auditId:row?.auditId||''});continue;
    }
    map.set(row.auditId,row);
   }
  }
  for(const id of expectedAuditIds){
   if(!sourceMap.has(id)||!targetMap.has(id)){
    issues.push({kind:'MISSING',label,auditId:id,source:sourceMap.has(id),target:targetMap.has(id)});continue;
   }
   const before=sourceMap.get(id),after=targetMap.get(id);
   if(digest(before.data)!==digest(after.data))issues.push({kind:'MISMATCH',label,auditId:id});
  }
  for(const [side,map] of [['source',sourceMap],['target',targetMap]])
   for(const id of map.keys())if(!expectedAuditIds.includes(id))
    issues.push({kind:'UNEXPECTED',label,side,auditId:id});
 };
 compare('AUDIT',sheetAudits,firestoreAudits);
 compare('AVAILABILITY',sheetAvailability,firestoreAvailability);
 return Object.freeze({ok:issues.length===0,checked:expectedAuditIds.length,issues,cutoverAuthorized:false});
}
