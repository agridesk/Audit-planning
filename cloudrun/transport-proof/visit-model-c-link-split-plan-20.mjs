// Issue #87: pure projection plan for Model C Visit-Obligation split.
// Caller MUST hold global gate, re-read canonical link table, CAS source revision,
// authenticate issued Visit identities, and transact Firestore before projection.
// Neither this function nor its output authorizes a write.
const text = value => String(value ?? '').trim();
const fail = code => {const e=new Error(code);e.code=code;throw e;};
const norm = row => (row || []).map(x=>String(x??''));
const a1 = n => {let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const column = (headers,name) => headers.findIndex(h=>text(h).toUpperCase().replace(/[\s-]/g,'_')===name);

/**
 * Input snapshot must be independently obtained under the same transaction fence.
 * linkValues: the COMPLETE canonical 2D table including header; no truncation.
 * appendRowNumbers: server-verified empty rows, one for each new link.
 */
export function prepareModelCVisitLinkSplit20({command,linkValues,appendRowNumbers,now}={}){
 if(command?.type!=='MODEL_C_COMPOSITION_PREFLIGHT'||command.mode!=='SEPARATELY'||command.canCommit!==false||
    !Array.isArray(command.visits)||command.visits.length<2||!text(command.auditId)||!text(command.companyUid))
   fail('MODEL_C_LINK_SPLIT_COMMAND_INVALID');
 if(!Array.isArray(linkValues)||linkValues.length<2||!Array.isArray(linkValues[0])||
    !Array.isArray(appendRowNumbers))fail('MODEL_C_LINK_SPLIT_SNAPSHOT_REQUIRED');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text(now)))
   fail('MODEL_C_LINK_SPLIT_TIMESTAMP_INVALID');
 const h=linkValues[0],required=['AUDIT_ID','OBLIGATION_ID','LINK_STATE','LINKED_AT','UNLINKED_AT'];
 const columns=Object.fromEntries(required.map(k=>[k,column(h,k)]));
 if(required.some(k=>columns[k]<0))fail('MODEL_C_LINK_SPLIT_SCHEMA_INVALID');
 const [a,o,state,linked,unlinked]=required.map(k=>columns[k]);
 const obligations=new Set(command.obligationIds||[]);
 if(obligations.size!==command.visits.length)fail('MODEL_C_LINK_SPLIT_PARTITION_INVALID');
 const byOb=new Map(),activeBySource=new Set(),allActive=new Set();
 for(let i=1;i<linkValues.length;i++){
  const row=linkValues[i];
  if(!Array.isArray(row)||row.length>h.length)fail('MODEL_C_LINK_SPLIT_ROW_INVALID');
  if(text(row[state]).toUpperCase()!=='ACTIVE')continue;
  const oid=text(row[o]),auditId=text(row[a]);
  if(!oid||!auditId||allActive.has(oid))fail('MODEL_C_LINK_SPLIT_ACTIVE_CONFLICT');
  allActive.add(oid);
  if(auditId===command.auditId){
   activeBySource.add(oid);
   byOb.set(oid,{sheetRow:i+1,before:norm(row)});
  }
 }
 if(activeBySource.size!==obligations.size||
    [...activeBySource].some(x=>!obligations.has(x)))fail('MODEL_C_LINK_SPLIT_SOURCE_LINK_DRIFT');
 const moves=command.visits.filter(x=>x.auditId!==command.auditId);
 if(command.visits.filter(x=>x.auditId===command.auditId).length!==1||
    new Set(command.visits.map(x=>x.obligationId)).size!==command.visits.length||
    moves.some(x=>!obligations.has(x.obligationId)))fail('MODEL_C_LINK_SPLIT_PARTITION_INVALID');
 if(moves.length!==appendRowNumbers.length)fail('MODEL_C_LINK_SPLIT_APPEND_ROWS_REQUIRED');
 const maxExisting=linkValues.length;
 const rowNumbers=new Set();
 for(const n of appendRowNumbers){
  if(!Number.isSafeInteger(n)||n<=maxExisting||rowNumbers.has(n))fail('MODEL_C_LINK_SPLIT_APPEND_UNVERIFIED');
  rowNumbers.add(n);
 }
 const projectionWrites=[],projectionPreconditions=[];
 const add=(range,before,after)=>{
  projectionWrites.push({range,values:[after]});
  projectionPreconditions.push({range,before});
 };
 for(let i=0;i<moves.length;i++){
  const move=moves[i],current=byOb.get(move.obligationId);
  if(!current)fail('MODEL_C_LINK_SPLIT_SOURCE_LINK_MISSING');
  const before=current.before,after=Array.from({length:h.length},(_,col)=>before[col]||'');
  after[state]='INACTIVE';after[unlinked]=now;
  const range='Audit_Visit_Obligations!A'+current.sheetRow+':'+a1(h.length)+current.sheetRow;
  add(range,before,after);
  const n=appendRowNumbers[i],newRow=new Array(h.length).fill('');
  newRow[a]=move.auditId;newRow[o]=move.obligationId;newRow[state]='ACTIVE';newRow[linked]=now;
  const appendRange='Audit_Visit_Obligations!A'+n+':'+a1(h.length)+n;
  add(appendRange,[],newRow);
 }
 return Object.freeze({
  mode:'SEPARATELY',sourceAuditId:command.auditId,
  movedObligationIds:moves.map(x=>x.obligationId),
  preservedObligationId:command.visits.find(x=>x.auditId===command.auditId).obligationId,
  projectionWrites,projectionPreconditions,
  sourceLinkCount:activeBySource.size,
  canCommit:false,requiresFence:true,
  requiredProofs:['GLOBAL_GATE','SOURCE_REVISION_CAS','CANONICAL_ID_ISSUANCE','APPEND_ROWS_EMPTY','FIRESTORE_MULTI_TRANSACTION','SHEETS_PROJECTION_VERIFIED','NOTIFICATION_OUTBOX_VERIFIED']
 });
}
