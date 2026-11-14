import {spawnSync} from 'node:child_process';
const project='audit-management-system-dev',spreadsheet='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const run=(args)=>{const r=spawnSync(process.platform==='win32'?'gcloud.cmd':'gcloud',args,{encoding:'utf8',windowsHide:true,shell:process.platform==='win32',timeout:45000});if(r.error||r.status!==0)throw Error('GCLOUD_FAILED_'+args[0]);return r.stdout.trim();};
const fail=x=>{throw Error('DIAGNOSTIC_BLOCKED_'+x)};
if(process.argv.length!==3||process.argv[2]!=='--readonly')fail('READONLY_FLAG_REQUIRED');
if(run(['config','get-value','project'])!==project)fail('ACTIVE_PROJECT_NOT_DEV');
const token=run(['auth','print-access-token']);if(!token)fail('TOKEN_MISSING');
const read=async(url)=>{const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});return {status:r.status,json:await r.json().catch(()=>({}))};};
const sheet=await read('https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheet+'/values/'+encodeURIComponent("'Auditors'!A1:AZ500"));
if(sheet.status!==200)fail('ROSTER_READ_'+sheet.status);
const rows=sheet.json.values||[],header=(rows[0]||[]).map(x=>String(x).toLowerCase().replace(/[\s_-]+/g,''));
const index=(...names)=>names.map(x=>header.indexOf(x.toLowerCase().replace(/[\s_-]+/g,''))).find(x=>x>=0)??-1;
const uid=index('Auditor UID','AuditorUID','UID','Auditor ID','AuditorID');
const role=index('Role'),active=index('Active');
if(uid<0||role<0)fail('ROSTER_COLUMNS_MISSING');
let checked=0,ok=0,missing=0,failed=0;
for(let i=1;i<rows.length;i++){
 const row=rows[i],id=String(row[uid]||'').trim(),isAuditor=String(row[role]||'').trim().toLowerCase()==='auditor';
 const enabled=active<0||['yes','true','1','active','x'].includes(String(row[active]||'').trim().toLowerCase());
 if(!isAuditor||!enabled||!id)continue;
 checked++;
 if(id.includes('/')||id==='.'||id==='..'||id.length>200)fail('INVALID_AUDITOR_UID_ROW_'+(i+1));
 const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/ams_availability_20_dev/'+encodeURIComponent(id);
 const result=await read(url);
 if(result.status===200){ok++;continue;}
 if(result.status===404){missing++;continue;}
 failed++;
 const message=String(result.json.error?.message||'');
 const category=message.toLowerCase().includes('document name')?'DOCUMENT_NAME':
 message.toLowerCase().includes('resource name')?'RESOURCE_NAME':
 message.toLowerCase().includes('invalid')?'INVALID_ARGUMENT':
 message.toLowerCase().includes('path')?'PATH':
 message.toLowerCase().includes('permission')?'PERMISSION':'OTHER';
 const excerpt=message.replaceAll(id,'[AUDITOR_ID]').replace(/projects\/[^/]+\/databases\/[^/]+\/documents\/[^\s"']+/gi,'[FIRESTORE_RESOURCE]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]').slice(0,230);
 console.log(JSON.stringify({row:i+1,http:result.status,googleStatus:String(result.json.error?.status||''),category,detail:excerpt}));
}
console.log(JSON.stringify({result:failed?'DEV_AVAILABILITY_READ_ERRORS':'DEV_AVAILABILITY_READ_PASS',checked,ok,missing,failed,readonly:true},null,2));
if(failed)process.exitCode=2;
