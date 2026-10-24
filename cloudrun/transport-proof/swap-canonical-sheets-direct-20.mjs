/**
 * DEV-only direct Google Sheets transport for the canonical SWAP migration.
 * This module does not perform SWAP transactions or bypass the existing GAS lock.
 * Never use for canonical writes until cross-runtime locking and rollback are implemented.
 */
export function createSwapCanonicalSheetsTransport({spreadsheetId, getToken, fetchImpl=fetch}={}){
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(String(spreadsheetId||'')))throw Error('SWAP_SHEETS_ID_INVALID');
 if(typeof getToken!=='function')throw Error('SWAP_SHEETS_TOKEN_PROVIDER_INVALID');
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
 async function request(path){
  const token=await getToken();
  if(!token)throw Error('SWAP_SHEETS_TOKEN_MISSING');
  const result=await fetchImpl(base+path,{method:'GET',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
  if(!result.ok)throw Error('SWAP_SHEETS_READ_HTTP_'+result.status);
  return result.json();
 }
 async function readValues(sheetName,range){
  if(typeof sheetName!=='string'||!sheetName||sheetName.length>100||/[\u0000-\u001f]/.test(sheetName))throw Error('SWAP_SHEETS_TAB_INVALID');
  if(typeof range!=='string'||!/^[A-Z]{1,3}[1-9][0-9]*(?::[A-Z]{1,3}[1-9][0-9]*)?$/.test(range))throw Error('SWAP_SHEETS_RANGE_INVALID');
  const quoted="'"+sheetName.replaceAll("'","''")+"'!"+range;
  const data=await request('/values/'+encodeURIComponent(quoted)+'?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
  return {range:data.range||quoted,values:Array.isArray(data.values)?data.values:[]};
 }
 async function readAuditRows({sheetName='Audit planning',auditIdHeader='Audit ID',auditIds,columns='A1:AZ2000'}={}){
  if(!Array.isArray(auditIds)||auditIds.length!==2||auditIds.some(id=>typeof id!=='string'||!id.trim()||id.length>140)||auditIds[0]===auditIds[1])
   throw Error('SWAP_SHEETS_PAIR_INVALID');
  const {values}=await readValues(sheetName,columns);
  if(!values.length)throw Error('SWAP_SHEETS_HEADERS_MISSING');
  const headers=values[0].map(value=>String(value??'').trim());
  const auditColumn=headers.indexOf(auditIdHeader);
  if(auditColumn<0||headers.indexOf(auditIdHeader,auditColumn+1)>=0)throw Error('SWAP_SHEETS_AUDIT_HEADER_INVALID');
  const selected=new Map();
  values.slice(1).forEach((row,index)=>{
   const id=String(row[auditColumn]??'').trim();
   if(!auditIds.includes(id))return;
   if(selected.has(id))throw Error('SWAP_SHEETS_AUDIT_DUPLICATE');
   selected.set(id,{sheetRow:index+2,values:row});
  });
  if(selected.size!==2)throw Error('SWAP_SHEETS_AUDIT_NOT_FOUND');
  return {headers,rows:auditIds.map(id=>({auditId:id,...selected.get(id)}))};
 }
 return Object.freeze({readValues,readAuditRows});
}
