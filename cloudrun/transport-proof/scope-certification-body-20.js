/**
 * Manager-only, DEV-scoped reassignment of Certification Body for an UNUSED scope.
 * Refuses any company-scope, obligation, planning or historical-audit association.
 * Preserve the existing CB's identity in all historical records.
 */
export async function updateScopeCertificationBody20({body,actor,SID,sheetsBatchGet,accessToken,clean}){
 const code=clean(body?.scopeCode),expected=clean(body?.expected).toUpperCase(),next=clean(body?.certificationBodyId).toUpperCase();
 if(!code||!next||!expected||body?.confirmation!=='CHANGE_UNUSED_SCOPE_CB')throw Error('SCOPE_CB_CHANGE_INVALID');
 const ranges=[
  'Config_Scopes!A1:Z128',
  'Certification_Bodies!A1:H200',
  'Company_Scopes!A1:Z1500',
  'Audit_Obligations!A1:AA2500',
  'Audit planning!A1:BW2500',
  'Log realized audits!A1:BE2500'
 ];
 const vr=await sheetsBatchGet(ranges);
 const data=vr.map(x=>x?.values||[]);
 const limits=[128,200,1500,2500,2500,2500];
 for(let i=0;i<data.length;i++)if(!data[i].length||data[i].length>=limits[i])throw Error('SCOPE_CB_ASSOCIATION_SCAN_INCOMPLETE');
 const [cfg,bodies,companyScopes,obligations,planning,realized]=data;
 const header=values=>(values[0]||[]).map(clean);
 const col=(h,name)=>h.indexOf(name);
 const ch=header(cfg),ci=col(ch,'ScopeCode'),bi=col(ch,'Certification_Body_ID'),slot=col(ch,'SlotKey');
 if(ci<0||bi<0||slot<0)throw Error('SCOPE_CB_SCHEMA_MISSING');
 const matches=cfg.map((row,i)=>({row,i})).filter(x=>x.i>0&&clean(x.row[ci])===code);
 if(matches.length!==1)throw Error('SCOPE_CB_IDENTITY_AMBIGUOUS');
 const scope=matches[0],before=clean(scope.row[bi]).toUpperCase(),slotKey=clean(scope.row[slot]);
 if(!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(slotKey))throw Error('SCOPE_CB_SLOT_INVALID');
 if(before!==expected)throw Error('SCOPE_CB_STALE_VALUE');
 const bh=header(bodies),cbId=col(bh,'Certification_Body_ID'),cbActive=col(bh,'Active');
 if(cbId<0||cbActive<0)throw Error('SCOPE_CB_REGISTRY_SCHEMA_MISSING');
 const candidates=bodies.slice(1).filter(row=>clean(row[cbId]).toUpperCase()===next);
 if(candidates.length!==1||!['TRUE','YES','1'].includes(clean(candidates[0][cbActive]).toUpperCase()))throw Error('SCOPE_CB_TARGET_NOT_ACTIVE');
 if(before===next)return{ok:true,unchanged:true,scopeCode:code,certificationBodyId:before};
 const csh=header(companyScopes),csi=col(csh,'ScopeCode');
 const oh=header(obligations),oi=col(oh,'ScopeCode');
 if(csi<0||oi<0)throw Error('SCOPE_CB_ASSOCIATION_SCHEMA_MISSING');
 if(companyScopes.slice(1).some(r=>clean(r[csi])===code))throw Error('SCOPE_CB_IN_USE_COMPANY_SCOPES');
 if(obligations.slice(1).some(r=>clean(r[oi])===code))throw Error('SCOPE_CB_IN_USE_OBLIGATIONS');
 const marked=v=>['TRUE','YES','1','X'].includes(clean(v).toUpperCase());
 const slotAssigned=(values)=>{
  const h=header(values),idx=col(h,slotKey),scopesList=col(h,'Scopes_List');
  if(idx<0)throw Error('SCOPE_CB_ASSOCIATION_SCHEMA_MISSING');
  return values.slice(1).some(r=>marked(r[idx])||scopesList>=0&&new RegExp('(^|[^A-Za-z0-9_-])'+code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^A-Za-z0-9_-])','i').test(clean(r[scopesList])));
 };
 if(slotAssigned(planning))throw Error('SCOPE_CB_IN_USE_AUDIT_PLANNING');
 if(slotAssigned(realized))throw Error('SCOPE_CB_IN_USE_REALIZED_AUDITS');
 const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
 const meta=await fetch(base+'?fields=sheets.properties(title,sheetId)',{headers:{authorization:'Bearer '+token}});
 if(!meta.ok)throw Error('SCOPE_CB_METADATA_UNAVAILABLE');
 const sheet=(await meta.json()).sheets?.map(s=>s.properties).find(s=>s.title==='Config_Scopes');
 if(!sheet)throw Error('SCOPE_CB_SHEET_MISSING');
 const request={updateCells:{start:{sheetId:sheet.sheetId,rowIndex:scope.i,columnIndex:bi},rows:[{values:[{userEnteredValue:{stringValue:next}}]}],fields:'userEnteredValue'}};
 const response=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests:[request]})});
 if(!response.ok)throw Error('SCOPE_CB_WRITE_FAILED_'+response.status);
 console.info(JSON.stringify({event:'SCOPE_CB_REASSIGNED_UNUSED',scopeCode:code,previous:before,certificationBodyId:next,actor:clean(actor?.email||actor?.sub),timestamp:new Date().toISOString()}));
 return{ok:true,scopeCode:code,previous:before,certificationBodyId:next};
}
