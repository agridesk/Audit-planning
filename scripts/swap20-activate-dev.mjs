// Run from Windows CMD: node scripts/swap20-activate-dev.mjs
// Fail-closed DEV activation. Never alters PROD or source audit rows.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cwd=resolve(root,'cloudrun','transport-proof');
function run(command,args,workdir=root){
 const result=spawnSync(command,args,{cwd:workdir,encoding:'utf8',shell:process.platform==='win32',maxBuffer:10*1024*1024,timeout:180000});
 if(result.stdout)process.stdout.write(result.stdout.endsWith('\n')?result.stdout:result.stdout+'\n');
 if(result.stderr)process.stderr.write(result.stderr.endsWith('\n')?result.stderr:result.stderr+'\n');
 if(result.error||result.status!==0)throw Error('STOP_'+command.toUpperCase()+'_'+(result.error?.code||result.status));
 return result.stdout||'';
}
function reports(text){
 return text.split(/\r?\n/).filter(x=>x.startsWith('{')).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
}
function requireReport(text,name){
 const found=reports(text).find(x=>x.result===name);
 if(!found)throw Error('STOP_EXPECTED_'+name);
 return found;
}
try{
 console.log('SWAP20_DEV_CUTOVER: begin; no PROD changes');
 run('git',['pull','--ff-only','origin','dev']);
 const parity=requireReport(run('node',['swap-dev-backfill-cli-20.mjs','--verify'],cwd),'DEV_PARITY_VERIFIED');
 if(parity.documents!==40||parity.eligible!==20)throw Error('STOP_CANONICAL_SCOPE_NOT_20_AUDITS');
 const scope=requireReport(run('node',['swap-dev-backfill-cli-20.mjs','--live-test'],cwd),'DEV_LIVE_FIRESTORE_SCOPE_PASS');
 if(scope.driftCount!==0||scope.audits!==20||scope.availability!==20)throw Error('STOP_CANONICAL_DRIFT_OR_COVERAGE');
 const orphan=requireReport(run('node',['swap-dev-backfill-cli-20.mjs','--inspect-orphans'],cwd),'DEV_ORPHAN_IMPACT');
 if(orphan.orphanCount!==4||orphan.slotsAnalyzed!==4||
    !Array.isArray(orphan.impacts)||orphan.impacts.some(x=>!x.valid||x.affectedAudits?.length))
  throw Error('STOP_ORPHAN_RESERVATION_NOT_ISOLATED');
 console.log('SWAP20_DEV_CUTOVER: data parity and orphan isolation verified');
 run('clasp',['push']);
 const check=run('clasp',['run','RUN_SWAP20_READ_WRITE_AUTHORITY_DEV_20261026']);
 if(!check.includes('DEV'))throw Error('STOP_CLASP_RUNTIME_IS_NOT_DEV');
 const description=JSON.parse(run('gcloud',['run','services','describe','ams-transport-proof','--project','audit-management-system-dev','--region','europe-west1','--format=json']));
 const env=description.spec?.template?.spec?.containers?.[0]?.env||description.template?.containers?.[0]?.env||[];
 const configured=[...env].filter(x=>['AMS_GAS_WRITE_URL','GAS_DEV_WRITE_URL'].includes(x.name)).map(x=>x.value||'').join(' ');
 const ids=[...new Set((run('clasp',['deployments']).match(/AKfy[A-Za-z0-9_-]+/g)||[]))];
 const configuredId=ids.find(id=>configured.includes(id));
 const deploymentId=configuredId||(ids.length===1?ids[0]:null);
 if(!deploymentId)throw Error('STOP_DEV_GAS_DEPLOYMENT_ID_AMBIGUOUS: provide the DEV deployment ID');
 console.log('SWAP20_DEV_CUTOVER: updating existing DEV GAS deployment');
 run('clasp',['deploy','--deploymentId',deploymentId,'--description','SWAP20 DEV Firestore exclusive authority']);
 run('clasp',['run','RUN_SWAP20_SET_FIRESTORE_AUTHORITY_DEV_20261026']);
 const confirmed=run('clasp',['run','RUN_SWAP20_READ_WRITE_AUTHORITY_DEV_20261026']);
 if(!confirmed.includes('FIRESTORE'))throw Error('STOP_GAS_AUTHORITY_NOT_CONFIRMED');
 console.log('SWAP20_DEV_CUTOVER: activating Cloud Run direct route');
 run('gcloud',['run','deploy','ams-transport-proof','--source','.','--project','audit-management-system-dev',
  '--region','europe-west1','--update-env-vars',
  'AMS_SWAP20_DIRECT_COMMIT_ENABLED=true,AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED=true,AMS_SWAP20_DIRECT_ROUTE=true','--quiet'],cwd);
 const after=JSON.parse(run('gcloud',['run','services','describe','ams-transport-proof','--project','audit-management-system-dev','--region','europe-west1','--format=json']));
 const newEnv=after.spec?.template?.spec?.containers?.[0]?.env||after.template?.containers?.[0]?.env||[];
 const values=Object.fromEntries(newEnv.map(x=>[x.name,x.value]));
 for(const key of ['AMS_SWAP20_DIRECT_COMMIT_ENABLED','AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED','AMS_SWAP20_DIRECT_ROUTE'])
  if(values[key]!=='true')throw Error('STOP_FLAG_NOT_ENABLED_'+key);
 console.log('SWAP20_DEV_DIRECT_WRITE_FLAGS_ON. Manager/Auditor end-to-end DEV UI swap still needs verification.');
}catch(error){
 console.error('SWAP20_DEV_ACTIVATION_INCOMPLETE: '+(error?.message||error));
 process.exitCode=1;
}
