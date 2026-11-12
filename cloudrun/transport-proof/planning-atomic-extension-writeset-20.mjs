/** Read-only Model C EXT/Undo projection preparation.
 * Exactly 9 distinct canonical cells and one CB outbox event.
 * No Firestore or Sheets writes occur in this module.
 */
const clean=x=>String(x??'').trim();
const columnNumber=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
const scalar=v=>v===null||['string','boolean','number'].includes(typeof v)&&
 (typeof v!=='number'||Number.isFinite(v));
export function buildAtomicExtensionWriteset20({plan,source,cbEvent,revisionOf}={}){
 if(!plan||!source||!cbEvent||typeof revisionOf!=='function'||
    !Array.isArray(plan.updates)||plan.updates.length!==9||
    !Array.isArray(source.planningRows)||!Array.isArray(source.obligationRows)||
    !Array.isArray(source.planningRows[0])||!Array.isArray(source.obligationRows[0])||
    !Array.isArray(cbEvent.values)||cbEvent.values.length!==16||
    cbEvent.values.some(x=>!scalar(x)))throw Error('EXT_ATOMIC_SOURCE_INCOMPLETE');
 const pi=source.planningRows[0].indexOf('Audit ID');
 if(pi<0)throw Error('EXT_ATOMIC_AUDIT_ID_COLUMN_MISSING');
 const candidates=source.planningRows.map((row,i)=>({row,i})).filter(x=>x.i>0&&
  clean(x.row[pi])===plan.auditId);
 if(candidates.length!==1)throw Error('EXT_ATOMIC_AUDIT_ID_AMBIGUOUS');
 const sourceRow=candidates[0],beforeRow=sourceRow.row.slice(),afterRow=beforeRow.slice();
 const audit=source.planningRows,obligation=source.obligationRows;
 const tabs={'Audit planning':audit,'Audit_Obligations':obligation};
 const writes=[],preconditions=[],keys=new Set();
 let auditCount=0,obligationCount=0;
 for(const item of plan.updates){
  const match=/^'(Audit planning|Audit_Obligations)'!([A-Z]+)([1-9]\d*)$/.exec(item?.range||'');
  if(!match||!Array.isArray(item.values)||item.values.length!==1||
     !Array.isArray(item.values[0])||item.values[0].length!==1||!scalar(item.values[0][0]))
   throw Error('EXT_ATOMIC_PROJECTION_RANGE_UNSUPPORTED');
  const [,sheet,colText,rowText]=match,rowNumber=Number(rowText),colNumber=columnNumber(colText);
  const table=tabs[sheet],original=table[rowNumber-1];
  if(!Array.isArray(original)||rowNumber<2||rowNumber>table.length||
     colNumber<0||colNumber>=table[0].length)
   throw Error('EXT_ATOMIC_PROJECTION_SOURCE_UNAVAILABLE');
  if(sheet==='Audit planning'){
   auditCount++;
   if(rowNumber!==sourceRow.i+1)throw Error('EXT_ATOMIC_AUDIT_ROW_MISMATCH');
   afterRow[colNumber]=item.values[0][0];
  }else obligationCount++;
  const key=sheet+'|'+rowNumber+'|'+colNumber;
  if(keys.has(key))throw Error('EXT_ATOMIC_PROJECTION_DUPLICATE');keys.add(key);
  const range=sheet+'!'+colText+rowNumber+':'+colText+rowNumber;
  writes.push({range,values:[[item.values[0][0]]]});
  preconditions.push({range,before:[original[colNumber]??'']});
 }
 if(auditCount!==4||obligationCount!==5||!clean(plan.obligationId)||
    !clean(plan.operationId)||!clean(cbEvent.eventId))
  throw Error('EXT_ATOMIC_PROJECTION_MEMBERSHIP_INVALID');
 const sourceRevision=revisionOf(audit[0],beforeRow),
  nextRevision=revisionOf(audit[0],afterRow);
 if(!clean(sourceRevision)||!clean(nextRevision))throw Error('EXT_ATOMIC_REVISION_UNVERIFIED');
 return {success:true,authorityPreflight:true,auditId:plan.auditId,
  obligationId:plan.obligationId,command:plan.command,requestId:plan.operationId,
  expectedSourceRevision:sourceRevision,
  canonicalSnapshot:{auditId:plan.auditId,sourceRow:sourceRow.i+1,
   headers:audit[0],row:afterRow,status:'Pending Planning',sourceRevision:nextRevision,
   scopeExtension:{obligationId:plan.obligationId,command:plan.command,expected:plan.expected}},
  sourceRowBefore:beforeRow,projectionWrites:writes,projectionPreconditions:preconditions,
  appendIntents:[{range:'CB_Extension_Outbox!A:P',values:[cbEvent.values]}],
  patch:plan.patch,cbNotification:{certificationBodyId:cbEvent.certificationBodyId,
   status:'PENDING_ATOMIC_OUTBOX',notBefore:cbEvent.notBefore,deliveryEnabled:false},
  owner:'CLOUD_RUN_DEV_EXT_ATOMIC_PREFLIGHT'};
}
