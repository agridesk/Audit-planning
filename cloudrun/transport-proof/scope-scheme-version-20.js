export async function scopeSchemeVersion20({method,body,actor,SID,sheetsBatchGet,accessToken,clean}){
 const code=clean(body?.scopeCode);let rows;try{rows=(await sheetsBatchGet(['Config_Scopes!A1:V128']))[0]?.values||[]}catch(e){const fallback=(await sheetsBatchGet(['Config_Scopes!A1:U128']))[0]?.values||[];rows=fallback.map(r=>[...r,''])}const headers=(rows[0]||[]).map(clean);
 const ci=headers.indexOf('ScopeCode'),vi=21,header=headers[vi]||'';
 if(ci<0||!['','Official_Scheme_Version'].includes(header))throw Error('SCHEME_VERSION_SCHEMA_CONFLICT');
 const matches=rows.map((r,i)=>({r,i})).filter(x=>x.i>0&&clean(x.r[ci])===code);
 if(matches.length!==1)throw Error('SCHEME_SCOPE_NOT_FOUND');
 const previous=clean(matches[0].r[vi]);
 if(method==='GET')return{ok:true,scopeCode:code,version:previous};
 const version=clean(body?.version).toUpperCase(),reason=clean(body?.reason);
 if(!/^V[1-9][0-9]*$/.test(version)||!reason||reason.length>500||body?.impactConfirmed!==true)throw Error('SCHEME_VERSION_INVALID');
 if(clean(body?.expected)!==previous)throw Error('STALE_SCHEME_VERSION');
 if(version===previous)return{ok:true,unchanged:true,scopeCode:code,version};
 const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
 const meta=await fetch(base+'?fields=sheets.properties(title,sheetId,gridProperties.columnCount)',{headers:{authorization:'Bearer '+token}});
 if(!meta.ok)throw Error('SHEET_METADATA_UNAVAILABLE');
 const sheet=(await meta.json()).sheets?.map(s=>s.properties).find(p=>p.title==='Config_Scopes');
 if(!sheet)throw Error('SCOPE_SHEET_MISSING');
 const cell=v=>({userEnteredValue:{stringValue:v}});
 const requests=[];
 if(Number(sheet.gridProperties?.columnCount||0)<=vi)requests.push({appendDimension:{sheetId:sheet.sheetId,dimension:'COLUMNS',length:vi+1-Number(sheet.gridProperties?.columnCount||0)}});
 if(!header)requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:0,columnIndex:vi},rows:[{values:[cell('Official_Scheme_Version')]}],fields:'userEnteredValue'}});
 requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:matches[0].i,columnIndex:vi},rows:[{values:[cell(version)]}],fields:'userEnteredValue'}});
 const response=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests})});
 if(!response.ok)throw Error('SCHEME_VERSION_WRITE_FAILED_'+response.status);
 console.info(JSON.stringify({event:'OFFICIAL_SCHEME_VERSION_CHANGED',scopeCode:code,before:previous,after:version,reason,actor:clean(actor.email||actor.sub),timestamp:new Date().toISOString()}));
 return{ok:true,scopeCode:code,version};
}
