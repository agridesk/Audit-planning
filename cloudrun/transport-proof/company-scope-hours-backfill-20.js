// Explicit DEV-only backfill from Company_Scopes.Company_Formal_Hours_Override.
// No legacy mutation, no Audit planning mutation, no automatic cutover.
import {previewCompanyHoursMigration20} from './company-scope-hours-migration-20.js';
import {COMPANY_SCOPE_HOURS_HEADERS} from './company-scope-hours-storage-20.js';
const c=x=>String(x??'').trim();
export async function backfillCompanyHours20({body,actor,SID,sheetsBatchGet,accessToken}){
 if(body?.confirmation!=='BACKFILL_COMPANY_HOURS_DEV'||body?.impactConfirmed!==true||!c(body.reason)||c(body.reason).length>500)throw Error('BACKFILL_CONFIRMATION_REQUIRED');
 const vr=await sheetsBatchGet(['Company_Scopes!A1:L2000','Config_Scopes!A1:U128','Company_Scope_Hours!A1:M2000']);
 const source=vr[0]?.values||[],config=vr[1]?.values||[],target=vr[2]?.values||[];
 const preview=previewCompanyHoursMigration20({companyScopes:source,configScopes:config,targetRows:target});
 if(!preview.ok)throw Error('BACKFILL_PREVIEW_FAILED');
 const h=(source[0]||[]).map(c),t=(target[0]||[]).map(c);
 if(COMPANY_SCOPE_HOURS_HEADERS.some((x,i)=>t[i]!==x))throw Error('BACKFILL_TARGET_SCHEMA_MISMATCH');
 const idx=x=>h.indexOf(x),tidx=x=>t.indexOf(x);
 const existing=new Set(target.slice(1).map(r=>c(r[tidx('SupersedesOverrideId')])).filter(Boolean));
 const now=new Date().toISOString(),actorId=c(actor.email||actor.sub||'Manager');
 const writes=[];
 for(const r of source.slice(1)){
  const raw=c(r[idx('Company_Formal_Hours_Override')]);if(!raw)continue;
  const sourceId=c(r[idx('Company_Scope_ID')]);if(existing.has(sourceId))continue;
  const active=['YES','TRUE','1'].includes(c(r[idx('Active')]).toUpperCase());
  const entry={
   OverrideId:'LEGACY_'+sourceId,Company_UID:c(r[idx('Company_UID')]),ScopeCode:c(r[idx('ScopeCode')]),Hours:Number(raw.replace(',','.')),
   EffectiveFrom:'',EffectiveTo:'',Status:active?'ACTIVE':'ENDED',Revision:'1',CreatedAt:now,CreatedBy:actorId,
   ChangeReason:'DEV migration: '+c(body.reason),SupersedesOverrideId:sourceId,ScopeVersionPolicy:'INHERIT_CURRENT'
  };
  writes.push(COMPANY_SCOPE_HOURS_HEADERS.map(k=>entry[k]??''));
 }
 if(writes.length===0)return{ok:true,unchanged:true,migrated:0,preview};
 if(writes.length+target.length>2000)throw Error('BACKFILL_TARGET_CAPACITY');
 const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
 const meta=await fetch(base+'?fields=sheets.properties(title,sheetId)',{headers:{authorization:'Bearer '+token}});
 if(!meta.ok)throw Error('BACKFILL_METADATA_UNAVAILABLE');
 const props=(await meta.json()).sheets?.map(x=>x.properties).find(x=>x.title==='Company_Scope_Hours');
 if(!props)throw Error('BACKFILL_TARGET_MISSING');
 const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}});
 const request={requests:[{updateCells:{start:{sheetId:props.sheetId,rowIndex:target.length,columnIndex:0},rows:writes.map(row=>({values:row.map(cell)})),fields:'userEnteredValue'}}]};
 const response=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(request)});
 if(!response.ok)throw Error('BACKFILL_ATOMIC_WRITE_FAILED_'+response.status);
 console.info(JSON.stringify({event:'COMPANY_HOURS_DEV_BACKFILL',actor:actorId,count:writes.length,timestamp:now}));
 return{ok:true,migrated:writes.length,sourceOverrides:preview.sourceOverrides,requiresReconciliation:true,cutover:false};
}
