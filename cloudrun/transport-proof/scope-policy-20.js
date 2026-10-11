export async function updateScopePolicy20({body,actor,SID,sheetsBatchGet,accessToken,clean}){
 const field=clean(body?.field),scopeCode=clean(body?.scopeCode),expected=String(body?.expected??''),value=String(body?.value??'').trim(),reason=clean(body?.reason);
 const numeric={'Max number audits':{min:0,max:10000,integer:true},'Min_Interval_Months':{min:0,max:1200,integer:true},'Max_Offsite_Hours':{min:0,max:1000},'Extension':{min:0,max:120,integer:true}};
 const windowFields=['Planning from','Planning to'];
 const allowed=[...Object.keys(numeric),...windowFields,'Active','Archived'];
 if(!allowed.includes(field)||!scopeCode||!reason||reason.length>500||body?.impactConfirmed!==true)throw Error('INVALID_POLICY_CHANGE');
 if(numeric[field]){const rule=numeric[field];if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)<rule.min||Number(value)>rule.max||(rule.integer&&!Number.isInteger(Number(value))))throw Error('INVALID_POLICY_VALUE');}
 if(['Active','Archived'].includes(field)&&!['TRUE','FALSE'].includes(value.toUpperCase()))throw Error('INVALID_BOOLEAN_POLICY');
 if(windowFields.includes(field)&&value&&!/^-?\d{1,3}$/.test(value))throw Error('INVALID_PLANNING_OFFSET');
 const data=await sheetsBatchGet(['Config_Scopes!A1:U128']),rows=data[0]?.values||[],headers=(rows[0]||[]).map(clean),ci=headers.indexOf('ScopeCode'),fi=headers.indexOf(field);
 if(ci<0||fi<0)throw Error('POLICY_SCHEMA_MISSING');
 const matches=rows.map((r,i)=>({r,i})).filter(x=>x.i>0&&clean(x.r[ci])===scopeCode);
 if(matches.length!==1)throw Error('SCOPE_AMBIGUOUS');
 const item=matches[0],before=String(item.r[fi]??'').trim();
 if(before!==expected)throw Error('STALE_SCOPE_POLICY');
 if(before===value)return{ok:true,unchanged:true,scopeCode,field};
 const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
 const meta=await fetch(base+'?fields=sheets.properties(title,sheetId)',{headers:{authorization:'Bearer '+token}});
 if(!meta.ok)throw Error('SHEET_METADATA_UNAVAILABLE');
 const sheet=(await meta.json()).sheets?.map(s=>s.properties).find(p=>p.title==='Config_Scopes');
 if(!sheet)throw Error('SCOPE_SHEET_MISSING');
 const cell={userEnteredValue:numeric[field]?{numberValue:Number(value)}:{stringValue:value}};
 const request={updateCells:{start:{sheetId:sheet.sheetId,rowIndex:item.i,columnIndex:fi},rows:[{values:[cell]}],fields:'userEnteredValue'}};
 const response=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests:[request]})});
 if(!response.ok)throw Error('POLICY_WRITE_FAILED_'+response.status);
 console.info(JSON.stringify({event:'SCOPE_POLICY_CHANGE',scopeCode,field,before,after:value,reason,actor:clean(actor.email||actor.sub),impactConfirmed:true,timestamp:new Date().toISOString()}));
 return{ok:true,scopeCode,field,previous:before,value};
}
