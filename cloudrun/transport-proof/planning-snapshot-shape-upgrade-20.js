/** DEV one-off: give legacy Model C split snapshots (no headers/row) the Grid row shape.
 * Firestore stays authoritative: a Sheet row is only copied when its authority
 * fields (Audit ID, Status, Auditor_UID, Planning JSON) equal the Firestore snapshot.
 * Reports counts and reason codes only; never audit IDs or row content.
 */
import {createHash} from 'node:crypto';
const clean=x=>String(x??'').trim();
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>clean(x)===clean(b[i]));
const legacyShape=s=>s&&typeof s==='object'&&(!Array.isArray(s.headers)||!Array.isArray(s.row));

export function planSnapshotShapeUpgrades20(sheetValues,records){
 if(!Array.isArray(sheetValues)||!Array.isArray(sheetValues[0])||!Array.isArray(records))throw Error('SHAPE_UPGRADE_SOURCE_INVALID');
 const headers=sheetValues[0].map(clean),col=name=>headers.indexOf(name);
 const idCol=col('Audit ID'),statusCol=col('Status'),uidCol=col('Auditor_UID'),jsonCol=col('Planning JSON');
 if([idCol,statusCol,uidCol,jsonCol].some(i=>i<0))throw Error('SHAPE_UPGRADE_HEADERS_MISSING');
 const sheetRows=new Map(),duplicateIds=new Set();
 for(let i=1;i<sheetValues.length;i++){
  const id=clean(sheetValues[i]?.[idCol]);if(!id)continue;
  if(sheetRows.has(id))duplicateIds.add(id);
  sheetRows.set(id,{sourceRow:i+1,row:sheetValues[i]});
 }
 const usedRows=new Set(),live=records.filter(r=>r&&r.removed!==true);
 let shapedHeadersDivergent=0;
 for(const r of live){
  const s=r.snapshot;
  if(Array.isArray(s?.headers)&&!same(s.headers,headers))shapedHeadersDivergent++;
  if(Number.isSafeInteger(s?.sourceRow))usedRows.add(s.sourceRow);
 }
 const candidates=[],blocked={};
 const block=reason=>{blocked[reason]=(blocked[reason]||0)+1;};
 for(const r of live){
  const s=r.snapshot;if(!legacyShape(s))continue;
  const auditId=clean(r.auditId);
  if(!auditId||clean(s.auditId)!==auditId){block('AUDIT_ID_MISMATCH');continue;}
  if(!Number.isSafeInteger(r.revision)||r.revision<0){block('REVISION_INVALID');continue;}
  if(r.pendingOperationId){block('PROJECTION_PENDING');continue;}
  if(s.identityRetired===true){block('IDENTITY_RETIRED');continue;}
  if(duplicateIds.has(auditId)){block('SHEET_AUDIT_ID_DUPLICATE');continue;}
  const hit=sheetRows.get(auditId);
  if(!hit){block('SHEET_ROW_MISSING');continue;}
  const row=hit.row.slice();while(row.length<headers.length)row.push('');
  if(clean(row[statusCol])!==clean(s.status)){block('STATUS_MISMATCH');continue;}
  if(clean(row[uidCol])!==clean(s.auditorUid)||clean(s.auditorUid)!==clean(r.auditorId)){block('AUDITOR_UID_MISMATCH');continue;}
  if(clean(row[jsonCol])!==clean(s.planningJson)){block('PLANNING_JSON_MISMATCH');continue;}
  if(usedRows.has(hit.sourceRow)){block('SOURCE_ROW_TAKEN');continue;}
  usedRows.add(hit.sourceRow);
  candidates.push({auditId,expectedRevision:r.revision,sourceRow:hit.sourceRow,headers:headers.slice(),row:hit.row.slice()});
 }
 candidates.sort((a,b)=>a.sourceRow-b.sourceRow);
 const manifest=createHash('sha256').update(JSON.stringify(candidates)).digest('hex');
 return {legacySnapshots:candidates.length+Object.values(blocked).reduce((a,b)=>a+b,0),eligible:candidates.length,blocked,shapedHeadersDivergent,manifest,candidates};
}

export async function executeSnapshotShapeUpgrades20({store,sheetValues,records,manifest}){
 if(typeof store?.upgradeSnapshotShape!=='function')throw Error('SHAPE_UPGRADE_STORE_UNAVAILABLE');
 const plan=planSnapshotShapeUpgrades20(sheetValues,records);
 if(!/^[0-9a-f]{64}$/.test(String(manifest||''))||manifest!==plan.manifest)throw Error('SHAPE_UPGRADE_MANIFEST_CHANGED');
 if(Object.keys(plan.blocked).length)throw Error('SHAPE_UPGRADE_BLOCKED_ROWS_PRESENT');
 let upgraded=0,replayed=0;
 for(const c of plan.candidates){
  const result=await store.upgradeSnapshotShape(c);
  if(result.upgraded)upgraded++;else replayed++;
 }
 return {eligible:plan.eligible,upgraded,replayed,manifest:plan.manifest};
}
