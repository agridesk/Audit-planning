export async function activateScopeHoursVersion20({body,actor,SID,sheetsBatchGet,accessToken,clean}){
 const scopeCode=clean(body?.scopeCode),reason=clean(body?.reason),expected=clean(body?.expectedVersion),raw=String(body?.hours??'').trim();
 if(body?.impactConfirmed!==true)throw Error('IMPACT_CONFIRMATION_REQUIRED');
 if(!scopeCode||!reason||reason.length>500||!/^V[1-9][0-9]*$/.test(expected)||!/^\d+(?:[.,]\d{1,2})?$/.test(raw))throw Error('INVALID_VERSION_CHANGE');
 const hours=Number(raw.replace(',','.'));if(hours>1000)throw Error('INVALID_HOURS');
 const vr=await sheetsBatchGet(['Config_Scopes!A1:U128','ScopeVersions!A1:I1000']),catalog=vr[0]?.values||[],versions=vr[1]?.values||[];
 const ch=(catalog[0]||[]).map(clean),vh=(versions[0]||[]).map(clean),ci=ch.indexOf('ScopeCode'),hi=ch.indexOf('Default_hours');
 const required=['ScopeCode','VersionId','Hours_to_plan','Status','Effective_From','Effective_To','Created_At','Created_By','Change_Reason'];
 if(ci<0||hi<0||required.some(h=>!vh.includes(h)))throw Error('VERSION_SCHEMA_INVALID');
 const match=catalog.map((r,i)=>({r,i})).filter(x=>x.i>0&&clean(x.r[ci])===scopeCode);
 const current=versions.map((r,i)=>({r,i})).filter(x=>x.i>0&&clean(x.r[vh.indexOf('ScopeCode')])===scopeCode&&clean(x.r[vh.indexOf('Status')]).toUpperCase()==='CURRENT');
 if(match.length!==1||current.length!==1)throw Error('SCOPE_OR_CURRENT_VERSION_AMBIGUOUS');
 const old=current[0],oldId=clean(old.r[vh.indexOf('VersionId')]),oldHours=Number(String(old.r[vh.indexOf('Hours_to_plan')]??'').replace(',','.'));
 if(oldId!==expected)throw Error('STALE_SCOPE_VERSION');
 if(!Number.isFinite(oldHours)||Number(String(match[0].r[hi]??'').replace(',','.'))!==oldHours)throw Error('HOURS_CATALOG_OUT_OF_SYNC');
 if(hours===oldHours)return{ok:true,unchanged:true,scopeCode,versionId:oldId,hours};
 const next='V'+(Number(oldId.slice(1))+1);
 if(versions.slice(1).some(r=>clean(r[vh.indexOf('ScopeCode')])===scopeCode&&clean(r[vh.indexOf('VersionId')])===next))throw Error('VERSION_ALREADY_EXISTS');
 if(versions.length>=1000)throw Error('VERSION_STORAGE_FULL');
 const token=await accessToken(),url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+':batchUpdate';
 const now=new Date().toISOString(),by=clean(actor.email||actor.sub||'Manager');
 const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}});
 const requests=[
  {updateCells:{start:{sheetId:20261011,rowIndex:old.i,columnIndex:3},rows:[{values:[cell('HISTORICAL')]}],fields:'userEnteredValue'}},
  {updateCells:{start:{sheetId:20261011,rowIndex:old.i,columnIndex:5},rows:[{values:[cell(now)]}],fields:'userEnteredValue'}},
  {updateCells:{start:{sheetId:20261011,rowIndex:versions.length,columnIndex:0},rows:[{values:[scopeCode,next,hours,'CURRENT',now,'',now,by,reason].map(cell)}],fields:'userEnteredValue'}}
 ];
 const meta=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'?fields=sheets.properties(title,sheetId)',{headers:{authorization:'Bearer '+token}});
 if(!meta.ok)throw Error('SHEET_METADATA_UNAVAILABLE');
 const props=(await meta.json()).sheets?.map(s=>s.properties)||[];
 const sheet=props.find(p=>p.title==='Config_Scopes'),vSheet=props.find(p=>p.title==='ScopeVersions');
 if(!sheet||!vSheet||vSheet.sheetId!==20261011)throw Error('VERSION_SHEET_ID_MISMATCH');
 requests.unshift({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:match[0].i,columnIndex:hi},rows:[{values:[cell(hours)]}],fields:'userEnteredValue'}});
 const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests})});
 if(!response.ok)throw Error('ATOMIC_VERSION_WRITE_FAILED_'+response.status);
 return{ok:true,scopeCode,versionId:next,hours,previousVersion:oldId};
}
