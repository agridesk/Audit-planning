/**
 * AMS EXT/Undo Model C live evidence: READ-ONLY. Never performs a mutation.
 * Node >=20. Only reads Cloud Run metadata, Sheets, Firestore in DEV.
 * Does not print tokens, company names, audit IDs, or obligation IDs.
 */
import {execFileSync} from 'node:child_process';

const project='audit-management-system-dev';
const region='europe-west1';
const spreadsheet='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const service='ams-fase12-dev';
const collectionPrefix='ams_scope_extension_20_dev_';
const notes=[];
const result={preflight:'AMS_EXT_MODEL_C_READ_ONLY',date:new Date().toISOString(),project,service,cloudRun:{},source:{},firestore:{},checks:{},decision:'BLOCKED'};
function check(name,ok,details){result.checks[name]={passed:!!ok,detail:details||''};}
function gcloud(args){
 const binary=process.platform==='win32'?'gcloud.cmd':'gcloud';
 return execFileSync(binary,args,{encoding:'utf8',timeout:45000,windowsHide:true,shell:process.platform==='win32',stdio:['ignore','pipe','pipe']}).trim();
}
async function api(url,token,{notFoundEmpty=false}={}){
 const response=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
 if(notFoundEmpty&&response.status===404)return {};
 if(!response.ok)throw Error('HTTP_'+response.status+'_'+new URL(url).hostname);
 return response.json();
}
const envValue=(rev,key)=>(rev?.spec?.containers?.[0]?.env||[]).find(x=>x.name===key)?.value||'';
const lookupHeader=(header,...names)=>names.map(n=>header.indexOf(n)).find(x=>x>=0)??-1;
const clean=x=>String(x??'').trim();
const stop=(msg)=>{notes.push(msg);result.notes=notes;console.log(JSON.stringify(result,null,2));process.exitCode=2;};
try{
 const raw=gcloud(['run','services','describe',service,'--project='+project,'--region='+region,'--format=json']);
 const svc=JSON.parse(raw);
 const serving=(svc.status?.traffic||[]).filter(x=>Number(x.percent)>0);
 result.cloudRun.revision=serving.map(x=>({name:x.revisionName,percent:x.percent}));
 check('one_serving_revision',serving.length===1&&Number(serving[0].percent)===100);
 const rev=JSON.parse(gcloud(['run','revisions','describe',String(serving[0]?.revisionName||''),'--project='+project,'--region='+region,'--format=json']));
 const flags=['AMS_RUNTIME_ENV','AMS_DEV_MAINTENANCE_MODE','AMS_DEV_EXT_READONLY_PREVIEW','AMS_DEV_EXT_COMMANDS_ENABLED','AMS_SCOPE_EXTENSION_AUTHORITY','AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED','AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED'];
 result.cloudRun.flags=Object.fromEntries(flags.map(k=>[k,envValue(rev,k)||'(unset)']));
 check('copy_dev_only',envValue(rev,'AMS_RUNTIME_ENV')==='DEV');
 check('isolated_preview_fenced',envValue(rev,'AMS_DEV_MAINTENANCE_MODE')==='true'&&envValue(rev,'AMS_DEV_EXT_READONLY_PREVIEW')==='true');
 const cmdEnabled=envValue(rev,'AMS_DEV_EXT_COMMANDS_ENABLED')==='true';
 result.cloudRun.commandWriteStatus=cmdEnabled?'ENABLED_BY_CONFIG':'DISABLED_BY_CONFIG';
 check('write_commands_still_blocked',!cmdEnabled,'Safety check: this diagnostic never enables writers');
}catch(e){notes.push('Cloud Run metadata unavailable: '+clean(e.message).slice(0,160));}
let token='';
try{token=gcloud(['auth','print-access-token']);if(!token)throw Error('EMPTY_ACCESS_TOKEN');}
catch(e){stop('GCloud user access token unavailable: '+clean(e.message).slice(0,120));}
if(token){
 try{
  const ranges=['Audit_Obligations!A1:Z2500','Audit_Visit_Obligations!A1:F2500','Audit planning!A1:CN2500','System_Config!A1:C100','Config_Scopes!A1:Z128'];
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheet+'/values:batchGet?'+ranges.map(x=>'ranges='+encodeURIComponent(x)).join('&');
  const response=await api(url,token);
  const values=(response.valueRanges||[]).map(x=>x.values||[]);
  if(values.length!==ranges.length)throw Error('SOURCE_RANGES_INCOMPLETE');
  const [ob,links,planning,config,scopes]=values;
  const oh=ob[0]||[],lh=links[0]||[],ph=planning[0]||[],ch=config[0]||[];
  const oi=lookupHeader(oh,'Obligation_ID'),ci=lookupHeader(oh,'Company_UID');
  const li=lookupHeader(lh,'Obligation_ID'),la=lookupHeader(lh,'Audit_ID'),ls=lookupHeader(lh,'Link_State');
  const pAudit=lookupHeader(ph,'Audit ID','Audit_ID'),pStatus=lookupHeader(ph,'Status');
  const required=[oi,ci,li,la,ls,pAudit,pStatus].every(x=>x>=0);
  check('model_c_source_columns',required);
  if(required){
   const allOb=ob.slice(1).filter(x=>clean(x[oi])),obSet=new Set(allOb.map(x=>clean(x[oi])));
   const active=links.slice(1).filter(x=>clean(x[ls]).toUpperCase()==='ACTIVE'&&clean(x[li]));
   const orphan=active.filter(x=>!obSet.has(clean(x[li]))).length;
   const dup=allOb.length-obSet.size;
   const statusMap=new Map(planning.slice(1).filter(x=>clean(x[pAudit])).map(x=>[clean(x[pAudit]),clean(x[pStatus]).toUpperCase().replace(/[\s-]+/g,'_')]));
   const pending=active.filter(x=>statusMap.get(clean(x[la]))==='PENDING_PLANNING');
   result.source={obligations:allOb.length,uniqueObligations:obSet.size,activeLinks:active.length,linkedPendingPlanning:pending.length,orphanActiveLinks:orphan,duplicateObligationIds:dup,scopeDefinitions:scopes.slice(1).filter(x=>x.some(v=>clean(v))).length};
   check('source_referential_integrity',orphan===0&&dup===0);
   check('model_c_source_nonempty',allOb.length>0);
  }
  const cfg=Object.fromEntries(config.slice(1).filter(x=>clean(x[0])).map(x=>[clean(x[0]),clean(x[1])]));
  result.source.writeGuards={ENV:cfg.ENV||'(unset)',ALLOW_DEV_WRITES:cfg.ALLOW_DEV_WRITES||'(unset)',DEV_WRITE_MODE:cfg.DEV_WRITE_MODE||'(unset)'};
  check('dev_source_writes_frozen',cfg.ENV==='DEV'&&cfg.ALLOW_DEV_WRITES==='FALSE'&&cfg.DEV_WRITE_MODE==='BLOCK');
 }catch(e){notes.push('Sheets source read failed: '+clean(e.message).slice(0,160));}
 for(const kind of ['obligation','auditcontext','event','outbox']){
  let count=0,continuation='',pages=0,sample=null,problem='';
  try{
   do{
    const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'+collectionPrefix+kind+'?pageSize=100'+(continuation?'&pageToken='+encodeURIComponent(continuation):'');
    const data=await api(url,token,{notFoundEmpty:true});
    const docs=data.documents||[];count+=docs.length;pages++;
    if(!sample&&docs.length)sample=docs[0];
    continuation=String(data.nextPageToken||'');
    if(pages>150)throw Error('COLLECTION_SCAN_LIMIT_EXCEEDED');
   }while(continuation);
   result.firestore[kind]={records:count,pages,firstHasPayload:sample?!!sample.fields?.payload:null};
   check('firestore_'+kind+'_read',true);
  }catch(e){problem=clean(e.message).slice(0,160);result.firestore[kind]={readError:problem};check('firestore_'+kind+'_read',false,problem)}
 }
 if(Number.isInteger(result.source.obligations)&&Number.isInteger(result.firestore.obligation?.records)){
  const src=result.source.obligations,dst=result.firestore.obligation.records;
  check('model_c_obligation_count_parity',src===dst,'Source '+src+' / target '+dst);
 }
 const migrated=Number(result.firestore.obligation?.records||0)>0&&Number(result.firestore.auditcontext?.records||0)>0;
 check('model_c_target_populated',migrated);
 const flags=result.cloudRun.flags||{};
 result.checks.migration_flag_verified={passed:flags.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED==='true'};
 result.checks.writer_fence_flag_verified={passed:flags.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED==='true'};
 check('independent_gas_writer_fence_evidence',false,'NOT ASSESSED: requires separate GAS triggers, script properties, and legacy writer audit');
 const failures=Object.entries(result.checks).filter(([,v])=>!v.passed).map(([k])=>k);
 result.decision='BLOCKED_PENDING_VERIFICATION';
 result.failedChecks=failures;
 notes.push('Read-only evidence only; no migration, cutover, writer flag or data was changed.');
 result.notes=notes;
 console.log(JSON.stringify(result,null,2));
}else{result.notes=notes;console.log(JSON.stringify(result,null,2));process.exitCode=2;}
