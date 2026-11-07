/** Read-only verification of DEV Model C maintenance traffic. No attestation is
 * returned for GAS Script Properties or legacy scheduler/triggers.
 */
import {execFileSync} from 'node:child_process';
const project='audit-management-system-dev',region='europe-west1';
if(![process.env.GOOGLE_CLOUD_PROJECT,process.env.GCLOUD_PROJECT,process.env.CLOUDSDK_CORE_PROJECT].includes(project))throw Error('EXT_MAINTENANCE_PROJECT_INVALID');
const cmd=args=>JSON.parse(execFileSync('gcloud',args,{encoding:'utf8',timeout:30000,maxBuffer:3*1024*1024}));
const services=['ams-transport-proof','ams-acceptance-20261107'];
const imageDigests=[];
const checked=[];
for(const service of services){
 const svc=cmd(['run','services','describe',service,'--project='+project,'--region='+region,'--format=json']);
 const routes=svc.status?.traffic||[];
 if(!Array.isArray(routes)||routes.length!==1||routes[0].percent!==100||routes[0].tag||!routes[0].revisionName)throw Error('EXT_MAINTENANCE_UNFENCED_TRAFFIC_'+service);
 const ingress=String(svc.metadata?.annotations?.['run.googleapis.com/ingress']||'');
 if(service==='ams-transport-proof'&&ingress!=='internal')throw Error('EXT_MAINTENANCE_MAIN_INGRESS_CHANGED');
 if(service==='ams-acceptance-20261107'&&(ingress!=='all'||String(svc.metadata?.annotations?.['run.googleapis.com/invoker-iam-disabled'])==='true'))throw Error('EXT_MAINTENANCE_ACCEPTANCE_IAM_UNVERIFIED');
 const r=cmd(['run','revisions','describe',routes[0].revisionName,'--project='+project,'--region='+region,'--format=json']);
 const containers=r.spec?.containers||[];
 if(containers.length!==1)throw Error('EXT_MAINTENANCE_CONTAINER_COUNT_INVALID');
 const image=String(containers[0].image||'');
 if(!/^europe-west1-docker\.pkg\.dev\/audit-management-system-dev\/cloud-run-source-deploy\/ams-transport-proof@sha256:[a-f0-9]{64}$/.test(image))throw Error('EXT_MAINTENANCE_IMAGE_IDENTITY_INVALID');
 const env=containers[0].env||[];
 const flag=name=>{const v=env.filter(x=>x.name===name);return v.length===1&&typeof v[0].value==='string'?v[0].value:''};
 if(flag('AMS_RUNTIME_ENV')!=='DEV'||flag('AMS_DEV_MAINTENANCE_MODE')!=='true'||!(/^[a-f0-9]{40}$/.test(flag('AMS_DEV_MAINTENANCE_SOURCE_SHA'))))throw Error('EXT_MAINTENANCE_REVISION_NOT_FENCED_'+service);
 for(const name of ['AMS_SCOPE_EXTENSION_AUTHORITY','AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED','AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED','AMS_SWAP20_DIRECT_COMMIT_ENABLED','AMS_SWAP20_CANONICAL_CUTOVER_VERIFIED','AMS_SWAP20_DIRECT_ROUTE']){
  if(['AMS_SCOPE_EXTENSION_AUTHORITY'].includes(name)?flag(name)==='FIRESTORE':flag(name)==='true')throw Error('EXT_MAINTENANCE_PREMATURE_CUTOVER_'+name);
 }
 imageDigests.push(image);checked.push({service,revision:routes[0].revisionName,sourceSha:flag('AMS_DEV_MAINTENANCE_SOURCE_SHA')});
}
if(new Set(imageDigests).size!==1||new Set(checked.map(x=>x.sourceSha)).size!==1)throw Error('EXT_MAINTENANCE_DIFFERENT_IMAGES');
console.log('AMS_DEV_MODEL_C_CLOUD_RUN_MAINTENANCE_PROOF '+JSON.stringify({project,services:checked,allRoutesFenced:true,legacyTaggedUrlsPresent:false,gasWriterFreezeVerified:false,cutoverAuthorized:false}));
