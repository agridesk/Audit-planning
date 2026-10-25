/**
 * Read-only DEV SWAP migration source preflight.
 * Inputs are Google Sheets values matrices with their header row.
 * Never authorizes migration or cutover.
 */
const val=(row,i)=>i<0?'':String(row[i]??'').trim();
function column(header,name){const i=header.indexOf(name);if(i<0)throw Error('SWAP_SHEET_HEADER_MISSING_'+name.replace(/[^A-Za-z0-9]/g,'_'));return i;}
export function inspectSwapSheetSources({auditRows,availabilityRows,journalRows}={}){
 if(!Array.isArray(auditRows)||!Array.isArray(availabilityRows)||!Array.isArray(journalRows)||!auditRows.length||!availabilityRows.length||!journalRows.length)
  throw Error('SWAP_SHEET_SOURCE_MISSING');
 const ah=auditRows[0],vh=availabilityRows[0],jh=journalRows[0];
 const ai=column(ah,'Audit ID'),as=column(ah,'Status'),ap=column(ah,'Planning JSON');
 const vd=column(vh,'Date'),vu=column(vh,'Auditor_UID'),ve=column(vh,'Auditor_Email'),v1=column(vh,'Audit_ID_1'),v2=column(vh,'Audit_ID_2'),vs1=column(vh,'Status_1'),vs2=column(vh,'Status_2');
 const jo=column(jh,'Operation_ID'),js=column(jh,'Stage');
 const ids=new Map(),issues=[],statuses={},planning={valid:0,empty:0,invalid:0},availability={rows:0,auditReferences:0,duplicateDayAuditorKeys:0,orphanReferences:0},stages={};
 for(let i=1;i<auditRows.length;i++){
  const row=auditRows[i]||[],id=val(row,ai);if(!id)continue;
  const status=val(row,as);statuses[status]=(statuses[status]||0)+1;
  if(ids.has(id))issues.push({kind:'DUPLICATE_AUDIT_ID',row:i+1,firstRow:ids.get(id),auditId:id});
  else ids.set(id,i+1);
  if(status==='Approved')issues.push({kind:'LEGACY_APPROVED_STATUS',row:i+1,auditId:id});
  const raw=val(row,ap);
  if(!raw){planning.empty++;if(status==='Accepted')issues.push({kind:'ACCEPTED_WITHOUT_PLANNING',row:i+1,auditId:id});continue;}
  try{const parsed=JSON.parse(raw);if(!parsed||!Array.isArray(parsed.blocks))throw Error('BLOCKS_MISSING');planning.valid++;}
  catch{planning.invalid++;issues.push({kind:'PLANNING_JSON_INVALID',row:i+1,auditId:id});}
 }
 const seen=new Map(),referenced=new Set(),journalOperations=new Map();
 for(let i=1;i<availabilityRows.length;i++){
  const row=availabilityRows[i]||[];if(!val(row,vd))continue;availability.rows++;
  const auditor=val(row,vu)||val(row,ve),key=val(row,vd)+'|'+auditor;
  if(auditor&&seen.has(key)){
   availability.duplicateDayAuditorKeys++;
   const previous=seen.get(key);
   const sameReservation=val(previous.row,v1)===val(row,v1)&&val(previous.row,v2)===val(row,v2)&&val(previous.row,vs1)===val(row,vs1)&&val(previous.row,vs2)===val(row,vs2);
   const reservationPresent=!!(val(row,v1)||val(row,v2)||val(previous.row,v1)||val(previous.row,v2));
   issues.push({kind:reservationPresent?(sameReservation?'DUPLICATE_RESERVATION_ROW':'CONFLICTING_RESERVATION_ROW'):'DUPLICATE_AVAILABILITY_POLICY_ROW',row:i+1,firstRow:previous.index});
  }else if(auditor)seen.set(key,{row,index:i+1});
  for(const [ix,sx] of [[v1,vs1],[v2,vs2]]){
   const id=val(row,ix);if(!id)continue;availability.auditReferences++;referenced.add(id);
   if(!ids.has(id)){availability.orphanReferences++;issues.push({kind:'AVAILABILITY_UNKNOWN_AUDIT',row:i+1,auditId:id,status:val(row,sx)});}
  }
 }
 for(let i=1;i<journalRows.length;i++){
  const row=journalRows[i]||[],operationId=val(row,jo);if(!operationId)continue;
  const stage=val(row,js);stages[stage]=(stages[stage]||0)+1;
  if(!journalOperations.has(operationId))journalOperations.set(operationId,[]);
  journalOperations.get(operationId).push({stage,row:i+1});
 }
 const journalTerminal={};
 for(const [operationId,events] of journalOperations){
  const terminal=events.at(-1).stage;journalTerminal[terminal]=(journalTerminal[terminal]||0)+1;
  if(terminal==='PREPARED'||terminal==='WRITING')issues.push({kind:'SWAP_JOURNAL_INCOMPLETE',operationId,lastRow:events.at(-1).row,stage:terminal});
  if(terminal!=='COMMITTED'&&terminal!=='CONFLICT'&&terminal!=='PREPARED'&&terminal!=='WRITING')issues.push({kind:'SWAP_JOURNAL_TERMINAL_UNKNOWN',operationId,lastRow:events.at(-1).row,stage:terminal});
  if(events.filter(e=>e.stage==='COMMITTED').length>1)issues.push({kind:'SWAP_JOURNAL_MULTIPLE_COMMITS',operationId});
 }
 return Object.freeze({auditCount:ids.size,statuses,planning,availability,journalStages:stages,journalTerminal,issueCount:issues.length,issues,sourceValidated:issues.length===0,cutoverAuthorized:false});
}
