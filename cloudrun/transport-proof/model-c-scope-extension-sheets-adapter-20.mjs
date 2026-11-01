/** DEV-only Sheets projection adapter for Firestore-owned scope extensions.
 * Reads all relationship evidence before any write; never resolves by company name.
 * No standalone use: create only behind verified global authority cutover.
 */
const str=x=>String(x??'').trim();
const key=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const column=index=>{let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s;};
export function createScopeExtensionSheetsAdapter20({batchGet,batchWrite,cutoverVerified=false}={}){
 if(cutoverVerified!==true||typeof batchGet!=='function'||typeof batchWrite!=='function')throw Error('EXT_SHEETS_ADAPTER_CUTOVER_UNVERIFIED');
 const names=['Audit_Obligations','Audit_Visit_Obligations','Audit planning'];
 async function readRows({auditId,companyUid,obligationId}={}){
  if(!str(auditId)||!str(companyUid)||!str(obligationId))throw Error('EXT_SHEETS_READ_ID_INVALID');
  const responses=await batchGet(['Audit_Obligations!A1:Z2500','Audit_Visit_Obligations!A1:F2500',"'Audit planning'!A1:CN2500"]);
  if(!Array.isArray(responses)||responses.length!==3)throw Error('EXT_SHEETS_READ_MISSING');
  const [obs,links,planning]=responses.map(x=>x?.values||[]);
  const [oh,lh,ph]=[obs,links,planning].map(a=>a[0]||[]);
  const field=(h,k)=>{const i=h.indexOf(k);if(i<0)throw Error('EXT_SHEETS_SCHEMA_MISSING_'+k);return i};
  const oc={id:field(oh,'Obligation_ID'),company:field(oh,'Company_UID'),applied:field(oh,'Extension_Applied'),meta:field(oh,'Extension_Metadata_JSON'),effective:field(oh,'Effective_Expiry_Date'),from:field(oh,'Planning_Window_From'),to:field(oh,'Planning_Window_To')};
  const lc={audit:field(lh,'Audit_ID'),ob:field(lh,'Obligation_ID'),state:field(lh,'Link_State')};
  const pc={audit:field(ph,'Audit ID'),status:field(ph,'Status'),expiry:field(ph,'Extended Expiration Date'),applied:field(ph,'Extension applied')};
  const matching=obs.slice(1).flatMap((row,i)=>str(row[oc.id])===obligationId&&str(row[oc.company])===companyUid?[{row,rowNumber:i+2}]:[]);
  const active=links.slice(1).filter(row=>str(row[lc.ob])===obligationId&&str(row[lc.audit])===auditId&&key(row[lc.state])==='ACTIVE');
  const audits=planning.slice(1).flatMap((row,i)=>str(row[pc.audit])===auditId?[{row,rowNumber:i+2}]:[]);
  if(matching.length!==1||active.length!==1||audits.length!==1)throw Error('EXT_SHEETS_RELATION_NOT_UNIQUE');
  const source=matching[0].row,audit=audits[0].row;
  return{companyUid,auditId,obligationId,linkState:'ACTIVE',auditStatus:key(audit[pc.status]),obligationRowCount:matching.length,auditRowCount:audits.length,
    extensionApplied:/^(yes|true|1|x)$/i.test(str(source[oc.applied])),extensionMetadata:str(source[oc.meta]),effectiveExpiry:str(source[oc.effective]),windowFrom:str(source[oc.from]),windowTo:str(source[oc.to]),aggregateExpiry:str(audit[pc.expiry]),aggregateApplied:/^(yes|true|1|x)$/i.test(str(audit[pc.applied])),
    locations:{obligationRow:matching[0].rowNumber,auditRow:audits[0].rowNumber,obligationColumns:oc,auditColumns:pc}};
 }
 async function writeCells({rows,expected,operationId}={}){
  if(!rows?.locations||!expected||str(rows.auditId)!==str(expected.auditId)||str(rows.companyUid)!==str(expected.companyUid)||str(rows.obligationId)!==str(expected.obligationId)||!str(operationId))throw Error('EXT_SHEETS_WRITE_LINEAGE_INVALID');
  const {obligationRow:orow,auditRow:arow,obligationColumns:o,auditColumns:a}=rows.locations;
  const updates=[];
  const put=(sheet,columnIndex,row,value)=>{if(!Number.isSafeInteger(columnIndex)||columnIndex<0||!Number.isSafeInteger(row)||row<2)throw Error('EXT_SHEETS_WRITE_COLUMN_INVALID');updates.push({range:"'"+sheet+"'!"+column(columnIndex)+row,values:[[value]]})};
  put('Audit_Obligations',o.applied,orow,expected.extensionApplied?'Yes':'');
  put('Audit_Obligations',o.meta,orow,expected.extensionMetadata);
  put('Audit_Obligations',o.effective,orow,expected.effectiveExpiry);
  put('Audit_Obligations',o.from,orow,expected.windowFrom);
  put('Audit_Obligations',o.to,orow,expected.windowTo);
  put('Audit planning',a.expiry,arow,expected.aggregateExpiry);
  put('Audit planning',a.applied,arow,expected.aggregateApplied?'Yes':'');
  await batchWrite(updates);
  return{operationId,cellCount:updates.length,projectionOnly:true};
 }
 return Object.freeze({readRows,writeCells});
}
