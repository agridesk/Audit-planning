/** Non-authorizing inventory of DEV Cloud Run writer-fence environment settings.
 * Never logs arbitrary environment variables, credentials or secret values.
 * Read-only: no changes to Cloud Run, Sheets or Firestore.
 */
import {execFileSync} from 'node:child_process';
const project='audit-management-system-dev',service='ams-transport-proof',region='europe-west1';
if(![process.env.GOOGLE_CLOUD_PROJECT,process.env.GCLOUD_PROJECT,process.env.CLOUDSDK_CORE_PROJECT].includes(project))throw Error('EXT_FENCE_SURVEY_PROJECT_MISMATCH');
function gcloud(args){
 const raw=execFileSync('gcloud',args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 return JSON.parse(raw);
}
const svc=gcloud(['run','services','describe',service,'--project='+project,'--region='+region,'--format=json(metadata.annotations,status.traffic,status.latestReadyRevisionName)']);
const ingress=String(svc?.metadata?.annotations?.['run.googleapis.com/ingress']||'UNKNOWN');
const ingressInternal=ingress==='internal';
const routes=svc?.status?.traffic;
if(!Array.isArray(routes)||routes.length===0||routes.length>25)throw Error('EXT_FENCE_SURVEY_TRAFFIC_INVALID');
const all=routes.map(r=>({revision:String(r.revisionName||''),percent:Number(r.percent||0),tagged:Boolean(r.tag)}));
if(all.some(r=>!/^ams-transport-proof-[a-z0-9-]+$/.test(r.revision)||r.percent<0||r.percent>100))throw Error('EXT_FENCE_SURVEY_REVISION_INVALID');
if(all.reduce((n,r)=>n+r.percent,0)!==100)throw Error('EXT_FENCE_SURVEY_TRAFFIC_PERCENT_INVALID');
const inspected=[];
for(const r of all){
 const rev=gcloud(['run','revisions','describe',r.revision,'--project='+project,'--region='+region,'--format=json(spec.containers)']);
 const containers=rev?.spec?.containers;
 if(!Array.isArray(containers)||!containers.length)throw Error('EXT_FENCE_SURVEY_CONTAINERS_UNKNOWN');
 const settings=containers.flatMap(c=>Array.isArray(c.env)?c.env:[]);
 const pick=name=>settings.filter(e=>e.name===name).map(e=>typeof e.value==='string'?e.value:'UNVERIFIED');
 const authority=pick('AMS_SCOPE_EXTENSION_AUTHORITY');
 const migration=pick('AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED');
 const fence=pick('AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED');
 inspected.push({receivesTraffic:r.percent>0,tagged:r.tagged,authorityFirestore:authority.length===1&&authority[0]==='FIRESTORE',migrationVerified:migration.length===1&&migration[0]==='true',writerFenceFlag:fence.length===1&&fence[0]==='true'});
}
const legacyOrUnknownRoutes=inspected.filter(r=>!r.authorityFirestore||!r.migrationVerified||!r.writerFenceFlag).length;
const attested=false; // No revision environment flag alone can prove all legacy writers globally fenced.
console.log('AMS_DEV_WRITER_FENCE_SURVEY '+JSON.stringify({project,externalIngressRestricted:ingressInternal,routeCount:inspected.length,liveRoutes:inspected.filter(x=>x.receivesTraffic).length,taggedRoutes:inspected.filter(x=>x.tagged).length,legacyOrUnknownRoutes,independentWriterFreezeVerified:attested,cutoverAuthorized:false}));
console.log('NO_RUNTIME_OR_DATA_CHANGES');
