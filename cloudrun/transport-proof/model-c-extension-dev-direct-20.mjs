/** Isolated DEV Model C Sheets owner: scope-specific Apply/Undo.
 * No Firestore promotion, no PROD, no GAS Script Properties.
 * Caller must enforce Manager auth, isolated DEV runtime and serialized writer.
 */
const t=x=>String(x??'').trim();
const norm=x=>t(x).toUpperCase().replace(/[\s-]+/g,'_');
const yes=x=>/^(yes|true|1|x)$/i.test(t(x));
const iso=x=>{
 const v=t(x);if(!v)return'';
 let y,m,d;
 if(/^\d{4}-\d{2}-\d{2}$/.test(v))[y,m,d]=v.split('-').map(Number);
 else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v))[d,m,y]=v.split('/').map(Number);
 else throw Error('EXT_DEV_DATE_FORMAT_INVALID');
 if(y<1||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())throw Error('EXT_DEV_DATE_INVALID');
 return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
};
const addMonths=(value,months)=>{
 if(!Number.isSafeInteger(months)||Math.abs(months)>240)throw Error('EXT_DEV_MONTHS_INVALID');
 const [y,m,d]=iso(value).split('-').map(Number);
 if(!y)throw Error('EXT_DEV_DATE_REQUIRED');
 const z=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(z.getUTCFullYear(),z.getUTCMonth()+1,0)).getUTCDate();
 return String(z.getUTCFullYear()).padStart(4,'0')+'-'+String(z.getUTCMonth()+1).padStart(2,'0')+'-'+String(Math.min(d,last)).padStart(2,'0');
};
const col=i=>{let n=i+1,s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s};
const index=(headers,name)=>{const i=headers.indexOf(name);if(i<0)throw Error('EXT_DEV_SCHEMA_MISSING_'+name);return i};
const get=(row,head,name)=>row[index(head,name)];
export function inspectDevScopeExtension20({obligationRows,linkRows,planningRows,scopeRows,companyUid}={}){
 const arrays=[obligationRows,linkRows,planningRows,scopeRows];
 if(arrays.some(rows=>!Array.isArray(rows)||!Array.isArray(rows[0])||rows.length>2501))throw Error('EXT_DEV_SOURCE_INVALID');
 const [O,L,P,S]=arrays.map(rows=>({head:rows[0].map(t),rows:rows.slice(1)}));
 const status=new Map(),auditRows=new Map();
 for(let i=0;i<P.rows.length;i++){const r=P.rows[i],id=t(get(r,P.head,'Audit ID'));if(!id)continue;if(status.has(id))throw Error('EXT_DEV_DUPLICATE_AUDIT_ID');status.set(id,norm(get(r,P.head,'Status')));auditRows.set(id,{row:r,rowNumber:i+2})}
 const policies=new Map();
 for(const r of S.rows){const key=t(get(r,S.head,'ScopeCode'));if(!key)continue;policies.set(key,{months:Number(get(r,S.head,'Extension')),from:Number(get(r,S.head,'Planning from')),to:Number(get(r,S.head,'Planning to'))})}
 const byOb=new Map(),byAudit=new Map();
 for(const r of L.rows){if(norm(get(r,L.head,'Link_State'))!=='ACTIVE')continue;const auditId=t(get(r,L.head,'Audit_ID')),id=t(get(r,L.head,'Obligation_ID'));if(!auditId||!id||byOb.has(id))throw Error('EXT_DEV_LINK_AMBIGUOUS');byOb.set(id,auditId);const group=byAudit.get(auditId)||[];group.push(id);byAudit.set(auditId,group)}
 const obligations=new Map(),records=[];
 for(let i=0;i<O.rows.length;i++){
  const row=O.rows[i],id=t(get(row,O.head,'Obligation_ID'));if(!id)continue;if(obligations.has(id))throw Error('EXT_DEV_DUPLICATE_OBLIGATION');
  const company=t(get(row,O.head,'Company_UID')),scopeCode=t(get(row,O.head,'ScopeCode')),auditId=byOb.get(id)||'';
  const rec={obligationId:id,companyUid:company,scopeCode,auditId,auditIds:auditId?[auditId]:[],
    auditStatuses:auditId?[{auditId,status:status.get(auditId)||'UNKNOWN'}]:[],
    triggerSource:t(get(row,O.head,'Trigger_Source')),extensionApplied:yes(get(row,O.head,'Extension_Applied')),
    extensionMetadata:t(get(row,O.head,'Extension_Metadata_JSON')),baseExpiry:iso(get(row,O.head,'Base_Expiry_Date')),
    effectiveExpiry:iso(get(row,O.head,'Effective_Expiry_Date')),windowFrom:iso(get(row,O.head,'Planning_Window_From')),
    windowTo:iso(get(row,O.head,'Planning_Window_To')),rowNumber:i+2,sourceRow:row,policy:policies.get(scopeCode)};
  let meta=null;try{meta=rec.extensionMetadata?JSON.parse(rec.extensionMetadata):null}catch{meta={invalid:true}}
  rec.extensionTransactionId=t(meta?.transactionId);
  const validPolicy=rec.policy&&Number.isSafeInteger(rec.policy.months)&&rec.policy.months>0&&Number.isSafeInteger(rec.policy.from)&&Number.isSafeInteger(rec.policy.to);
  const validDates=!!rec.baseExpiry&&!!rec.effectiveExpiry&&!!rec.windowFrom&&!!rec.windowTo&&rec.windowFrom<=rec.windowTo;
  const base=auditId&&status.get(auditId)==='PENDING_PLANNING'&&rec.triggerSource.toUpperCase()!=='ECAS'&&validDates&&!!validPolicy;
  const legacyUndone=!!(base&&!rec.extensionApplied&&meta?.source==='CLOUD_RUN_DIRECT_MANAGER_EXTENSION'
    &&meta?.undo===true&&Number(meta.months)===rec.policy.months&&rec.effectiveExpiry===rec.baseExpiry);
  rec.canApply=!!(base&&!rec.extensionApplied&&(!rec.extensionMetadata||legacyUndone));
  const legacyUndo=base&&rec.extensionApplied&&meta?.source==='CLOUD_RUN_DIRECT_MANAGER_EXTENSION'
    &&meta?.undo!==true&&Number(meta.months)===rec.policy.months&&!!rec.baseExpiry
    &&rec.effectiveExpiry===addMonths(rec.baseExpiry,rec.policy.months)
    &&(byAudit.get(auditId)||[]).length===1;
  rec.canUndo=!!(base&&rec.extensionApplied&&((meta?.source==='AMS_DEV_MODEL_C_SCOPE_EXTENSION_20'&&rec.extensionTransactionId&&meta?.before)||legacyUndo));
  rec.canMutate=!!(rec.canApply||rec.canUndo);
  rec.extensionMonths=validPolicy?rec.policy.months:0;
  rec.authority=rec.canMutate?'DEV_MODEL_C_SHEETS':'READ_ONLY';
  obligations.set(id,rec);
  if(!companyUid||company===companyUid)records.push(rec);
 }
 for(const [auditId,ids] of byAudit){if(!auditRows.has(auditId)||ids.some(id=>!obligations.has(id)))throw Error('EXT_DEV_ORPHAN_LINK')}
 return{records,obligations,byAudit,auditRows,planningHead:P.head,obligationHead:O.head,mode:'DEV_MODEL_C_DIRECT',canMutate:records.some(x=>x.canMutate)};
}
export function planDevScopeExtension20({snapshot,auditId,companyUid,obligationId,command,requestId,actorUid}={}){
 if(!snapshot||!['apply','undo'].includes(command)||!t(auditId)||!t(companyUid)||!t(obligationId)||!t(requestId)||!t(actorUid)||t(requestId).length>180)throw Error('EXT_DEV_COMMAND_INVALID');
 const id=t(obligationId),rec=snapshot.obligations.get(id),ids=snapshot.byAudit.get(t(auditId))||[];
 if(!rec||rec.companyUid!==companyUid||rec.auditId!==auditId||!ids.includes(id)||ids.length>100||!(command==='apply'?rec.canApply:rec.canUndo))throw Error('EXT_DEV_SCOPE_NOT_ELIGIBLE');
 const before={effectiveExpiry:rec.effectiveExpiry,windowFrom:rec.windowFrom,windowTo:rec.windowTo,extensionApplied:rec.extensionApplied,extensionMetadata:rec.extensionMetadata};
 let after;
 if(command==='apply'){
  const effectiveExpiry=addMonths(rec.effectiveExpiry,rec.policy.months),windowFrom=addMonths(effectiveExpiry,rec.policy.from),windowTo=addMonths(effectiveExpiry,rec.policy.to);
  if(windowFrom>windowTo)throw Error('EXT_DEV_POLICY_WINDOW_INVALID');
  after={effectiveExpiry,windowFrom,windowTo,extensionApplied:true,extensionMetadata:JSON.stringify({source:'AMS_DEV_MODEL_C_SCOPE_EXTENSION_20',transactionId:requestId,actorUid,scopeCode:rec.scopeCode,months:rec.policy.months,before})};
 }else{
  const meta=JSON.parse(rec.extensionMetadata);
  if(meta.source==='CLOUD_RUN_DIRECT_MANAGER_EXTENSION'){
   if(meta.undo===true||Number(meta.months)!==rec.policy.months||ids.length!==1
     ||rec.effectiveExpiry!==addMonths(rec.baseExpiry,rec.policy.months))throw Error('EXT_DEV_LEGACY_UNDO_PROVENANCE_INVALID');
   after={effectiveExpiry:rec.baseExpiry,windowFrom:addMonths(rec.baseExpiry,rec.policy.from),
     windowTo:addMonths(rec.baseExpiry,rec.policy.to),extensionApplied:false,extensionMetadata:''};
  }else{
   if(meta.source!=='AMS_DEV_MODEL_C_SCOPE_EXTENSION_20'||meta.scopeCode!==rec.scopeCode||!t(meta.transactionId)||!meta.before)throw Error('EXT_DEV_UNDO_PROVENANCE_INVALID');
   after=meta.before;
   if(!after||!iso(after.effectiveExpiry)||!iso(after.windowFrom)||!iso(after.windowTo)||after.extensionApplied!==false||t(after.extensionMetadata))throw Error('EXT_DEV_UNDO_SNAPSHOT_INVALID');
  }
 }
 const changed={...rec,...after};
 const all=ids.map(k=>k===id?changed:snapshot.obligations.get(k));
 if(all.some(x=>!x||x.auditId!==auditId||x.companyUid!==companyUid))throw Error('EXT_DEV_AUDIT_LINEAGE_INVALID');
 const active=all.filter(x=>x.triggerSource.toUpperCase()!=='ECAS'&&x.effectiveExpiry);
 if(!active.length)throw Error('EXT_DEV_AGGREGATE_EMPTY');
 const expiry=active.map(x=>x.effectiveExpiry).sort()[0];
 const starts=active.map(x=>x.windowFrom).filter(Boolean),ends=active.map(x=>x.windowTo).filter(Boolean);
 const from=starts.sort().at(-1)||'',to=ends.sort()[0]||'',joint=from&&to&&from<=to;
 const audit=snapshot.auditRows.get(auditId);
 if(!audit||norm(get(audit.row,snapshot.planningHead,'Status'))!=='PENDING_PLANNING')throw Error('EXT_DEV_AUDIT_STATUS_CONFLICT');
 const updates=[],put=(sheet,head,row,name,value)=>updates.push({range:"'"+sheet+"'!"+col(index(head,name))+row,values:[[value]]});
 const oh=snapshot.obligationHead,ph=snapshot.planningHead;
 put('Audit_Obligations',oh,rec.rowNumber,'Extension_Applied',after.extensionApplied?'Yes':'');
 put('Audit_Obligations',oh,rec.rowNumber,'Extension_Metadata_JSON',after.extensionMetadata);
 put('Audit_Obligations',oh,rec.rowNumber,'Effective_Expiry_Date',after.effectiveExpiry);
 put('Audit_Obligations',oh,rec.rowNumber,'Planning_Window_From',after.windowFrom);
 put('Audit_Obligations',oh,rec.rowNumber,'Planning_Window_To',after.windowTo);
 put('Audit planning',ph,audit.rowNumber,'Extension applied',all.some(x=>x.extensionApplied)?'Yes':'');
 put('Audit planning',ph,audit.rowNumber,'Extended Expiration Date',expiry);
 put('Audit planning',ph,audit.rowNumber,'Planning window from',joint?from:'');
 put('Audit planning',ph,audit.rowNumber,'Planning window to',joint?to:'');
 return{updates,auditId,obligationId:id,scopeCode:rec.scopeCode,command,operationId:requestId,
  expected:{...after,aggregateExpiry:expiry,aggregateApplied:all.some(x=>x.extensionApplied),planningWindowFrom:joint?from:'',planningWindowTo:joint?to:''},
  patch:{auditId,extensionApplied:all.some(x=>x.extensionApplied),expiryZ:expiry,planningWindowFrom:joint?from:'',planningWindowTo:joint?to:'',requiresSeparatePlanning:!joint},
  direct:true,projection:'PROJECTED'};
}
