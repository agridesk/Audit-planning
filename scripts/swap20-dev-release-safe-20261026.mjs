// Safe DEV-only release of SWAP 2.0. Stops before deploy on incomplete evidence.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cloud=resolve(root,'cloudrun','transport-proof');
const project='audit-management-system-dev', service='ams-transport-proof',region='europe-west1';
function run(name,args,cwd=root){
 const onWindows=process.platform==='win32';
 const cmd=onWindows?'cmd.exe':name;
 const params=onWindows?['/d','/s','/c',[name,...args].join(' ')]:args;
 const r=spawnSync(cmd,params,{cwd,encoding:'utf8',maxBuffer:20_000_000,timeout:300000});
 if(r.stdout)process.stdout.write(r.stdout.endsWith('\n')?r.stdout:r.stdout+'\n');
 if(r.stderr)process.stderr.write(r.stderr.endsWith('\n')?r.stderr:r.stderr+'\n');
 if(r.error||r.status!==0)throw Error('RELEASE_STEP_FAILED_'+name+'_'+(r.error?.code||r.status));
 return r.stdout||'';
}
function serviceState(){
 const raw=run('gcloud',['run','services','describe',service,'--project',project,'--region',region,'--format=json']);
 const data=JSON.parse(raw);
 const container=data.spec?.template?.spec?.containers?.[0]||data.template?.containers?.[0];
 if(!container)throw Error('DEV_CLOUD_RUN_CONFIG_MISSING');
 const env=Object.fromEntries((container.env||[]).filter(x=>typeof x.value==='string').map(x=>[x.name,x.value]));
 return {data,env};
}
try{
 console.log('DEV SWAP release preflight. PROD excluded.');
 const git=run('git',['status','--porcelain','--untracked-files=no']);
 if(git.trim())throw Error('TRACKED_WORKTREE_NOT_CLEAN');
 const state=serviceState();
 for(const k of ['AMS_SWAP20_DIRECT_COMMIT_ENABLED','AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED','AMS_SWAP20_DIRECT_ROUTE'])
  if(state.env[k]!=='true')throw Error('DIRECT_CUTOVER_FLAG_MISSING_'+k);
 run('npm',['run','test:swap-firestore'],cloud);
 run('npm',['run','test:swap'],cloud);
 console.log('SWAP local regression gates: PASS');
 // Updating a GAS version is allowed ONLY if DEV Cloud Run explicitly points to
 // that existing deployment. Never guess or create a second deployment.
 const gasUrl=state.env.AMS_GAS_WRITE_URL||state.env.GAS_DEV_WRITE_URL||'';
 const matches=gasUrl.match(/AKfy[A-Za-z0-9_-]+/g)||[];
 const configuredId=matches.length===1?matches[0]:'';
 if(!configuredId)throw Error('DEV_GAS_DEPLOYMENT_URL_NOT_UNAMBIGUOUS');
 const listing=run('clasp',['deployments']);
 const listed=[...new Set(listing.match(/AKfy[A-Za-z0-9_-]+/g)||[])];
 if(!listed.includes(configuredId))throw Error('DEV_GAS_DEPLOYMENT_NOT_IN_CLASP_PROJECT');
 run('clasp',['push']);
 const versionOf=(log,id)=>{
  const row=log.split(/\r?\n/).find(line=>line.includes(id+' @'));
  const match=row?.match(/@(\d+)/);
  return match?Number(match[1]):null;
 };
 const priorVersion=versionOf(listing,configuredId);
 if(priorVersion===null)throw Error('DEV_GAS_PRIOR_VERSION_UNKNOWN');
 // Installed clasp 3.x: the 2.x deploy alias silently prints a CLI error yet exits 0.
 const deploymentOutput=run('clasp',['update-deployment',configuredId]);
 if(/(^|\n)\s*error:|too many arguments|unknown command/i.test(deploymentOutput))
  throw Error('DEV_GAS_CLI_DEPLOYMENT_REJECTED');
 const postListing=run('clasp',['list-deployments']);
 const nextVersion=versionOf(postListing,configuredId);
 if(nextVersion===null||nextVersion<=priorVersion)
  throw Error('DEV_GAS_VERSION_NOT_ADVANCED_'+priorVersion+'_'+nextVersion);
 console.log('DEV GAS executable deployment updated: '+configuredId+' @'+priorVersion+' -> @'+nextVersion);
 run('gcloud',['run','deploy',service,'--source','.','--project',project,'--region',region,
  '--update-env-vars','AMS_SWAP20_DIRECT_COMMIT_ENABLED=true,AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED=true,AMS_SWAP20_DIRECT_ROUTE=true','--quiet'],cloud);
 const after=serviceState(),ready=after.data.status?.conditions?.find(x=>x.type==='Ready');
 if(ready?.status!=='True')throw Error('DEV_CLOUD_RUN_NOT_READY');
 console.log(JSON.stringify({result:'DEV_SWAP20_RELEASE_DEPLOYED',revision:after.data.status?.latestReadyRevisionName||'',directRoute:after.env.AMS_SWAP20_DIRECT_ROUTE,gasDeployment:configuredId,liveUserFlowVerified:false}));
}catch(err){
 console.error('DEV_SWAP20_RELEASE_STOPPED: '+(err?.message||err));
 process.exitCode=1;
}
