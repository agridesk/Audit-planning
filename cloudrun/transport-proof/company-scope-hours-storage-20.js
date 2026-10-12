// Canonical normalized company-specific scope hours storage (DEV only).
// Tab creation is explicit and idempotent; never modify Audit planning.
export const COMPANY_SCOPE_HOURS_TAB='Company_Scope_Hours';
export const COMPANY_SCOPE_HOURS_HEADERS=['OverrideId','CompanyID','ScopeCode','Hours','EffectiveFrom','EffectiveTo','Status','Revision','CreatedAt','CreatedBy','ChangeReason','SupersedesOverrideId','ScopeVersionPolicy'];
const c=x=>String(x??'').trim();
const endpoint=sid=>'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sid);
export async function companyHoursStorage20({method,body={},SID,accessToken,sheetsBatchGet}){
 if(!SID)throw Error('DEV_SPREADSHEET_ID_REQUIRED');
 const token=await accessToken(),base=endpoint(SID);
 const resp=await fetch(base+'?fields=sheets.properties(title,sheetId,gridProperties)',{headers:{authorization:'Bearer '+token}});
 if(!resp.ok)throw Error('COMPANY_HOURS_METADATA_UNAVAILABLE');
 const sheets=(await resp.json()).sheets||[],found=sheets.map(s=>s.properties).find(p=>p.title===COMPANY_SCOPE_HOURS_TAB);
 if(!found){
  if(method!=='POST')return{ok:true,ready:false,tab:COMPANY_SCOPE_HOURS_TAB,headers:COMPANY_SCOPE_HOURS_HEADERS};
  if(body.confirmation!=='CREATE_COMPANY_SCOPE_HOURS_TAB')throw Error('STORAGE_CREATION_CONFIRMATION_REQUIRED');
  const cell=v=>({userEnteredValue:{stringValue:v}});
  const req={requests:[
   {addSheet:{properties:{title:COMPANY_SCOPE_HOURS_TAB,gridProperties:{rowCount:2000,columnCount:COMPANY_SCOPE_HOURS_HEADERS.length}}}},
   {updateCells:{start:{sheetId:0,rowIndex:0,columnIndex:0},rows:[{values:COMPANY_SCOPE_HOURS_HEADERS.map(cell)}],fields:'userEnteredValue'}}
  ]};
  // Sheets cannot reference a newly allocated sheet ID in the same batch.
  // Supply an explicit unique sheetId so sheet creation and header creation are atomic.
  const existing=new Set(sheets.map(s=>s.properties?.sheetId));
  let id=20261012;while(existing.has(id))id++;
  req.requests[0].addSheet.properties.sheetId=id;
  req.requests[1].updateCells.start.sheetId=id;
  const created=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(req)});
  if(!created.ok)throw Error('COMPANY_HOURS_CREATE_FAILED_'+created.status);
  const data=await created.json();
  if(data.replies?.[0]?.addSheet?.properties?.sheetId!==id)throw Error('COMPANY_HOURS_CREATE_UNVERIFIED');
  return{ok:true,ready:true,created:true,tab:COMPANY_SCOPE_HOURS_TAB};
 }
 const vr=await sheetsBatchGet([COMPANY_SCOPE_HOURS_TAB+'!A1:M2000']);
 const values=vr[0]?.values||[],head=(values[0]||[]).map(c);
 if(COMPANY_SCOPE_HOURS_HEADERS.some((h,i)=>head[i]!==h))throw Error('COMPANY_HOURS_SCHEMA_MISMATCH');
 return{ok:true,ready:true,created:false,tab:COMPANY_SCOPE_HOURS_TAB,count:values.slice(1).filter(r=>r.some(x=>c(x))).length};
}
