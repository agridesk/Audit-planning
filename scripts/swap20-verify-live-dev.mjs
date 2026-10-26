import {spawnSync} from 'node:child_process';
const project='audit-management-system-dev',service='ams-transport-proof',region='europe-west1';
function gcloud(args){
 const cmd=process.platform==='win32'?'cmd.exe':'gcloud';
 const cliArgs=process.platform==='win32'?['/d','/s','/c','gcloud '+args.join(' ')]:args;
 const r=spawnSync(cmd,cliArgs,{encoding:'utf8',timeout:45000,maxBuffer:2_000_000});
 if(r.error||r.status!==0)throw Error('GCLOUD_READ_FAILED: '+String(r.stderr||r.error?.message||r.status).slice(0,350));
 return r.stdout;
}
try{
 const v=JSON.parse(gcloud(['run','services','describe',service,'--project',project,'--region',region,'--format=json']));
 const container=v.spec?.template?.spec?.containers?.[0]||v.template?.containers?.[0];
 if(!container)throw Error('DEV_SERVICE_FORMAT_UNEXPECTED');
 const variables=Object.fromEntries((container.env||[]).map(x=>[x.name,x.value]));
 const flags=['AMS_SWAP20_DIRECT_COMMIT_ENABLED','AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED','AMS_SWAP20_DIRECT_ROUTE'];
 const missing=flags.filter(x=>variables[x]!=='true');
 const ready=v.status?.conditions?.find(x=>x.type==='Ready');
 const revision=v.status?.latestReadyRevisionName||'';
 const out={environment:'DEV',service,revision,ready:ready?.status==='True',directFlags:missing.length===0,missingFlags:missing};
 console.log(JSON.stringify(out));
 if(!out.ready||!out.directFlags||!revision)process.exitCode=1;
 else console.log('DEV_DIRECT_ROUTE_DEPLOYED: perform authenticated Manager/Auditor SWAP UI acceptance.');
}catch(e){console.error('DEV_DIRECT_ROUTE_UNVERIFIED: '+e.message);process.exitCode=1;}
