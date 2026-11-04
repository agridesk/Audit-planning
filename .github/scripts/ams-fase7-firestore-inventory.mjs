import {execFileSync} from 'node:child_process';

const project='audit-management-system-dev';
if(process.env.GOOGLE_CLOUD_PROJECT!==project&&process.env.GCLOUD_PROJECT!==project&&process.env.CLOUDSDK_CORE_PROJECT!==project){
 throw Error('EXT_INVENTORY_DEV_PROJECT_MISMATCH');
}
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',timeout:30000}).trim();
if(!token)throw Error('EXT_INVENTORY_TOKEN_MISSING');
const root='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const collections=['ams_scope_extension_20_dev_obligation','ams_scope_extension_20_dev_auditcontext','ams_scope_extension_20_dev_event','ams_scope_extension_20_dev_outbox'];
let totals={};
for(const collection of collections){
 let pageToken='',seen=new Set(),total=0,pages=0;
 do{
  const url=new URL(root+'/'+collection);
  url.searchParams.set('pageSize','100');
  url.searchParams.set('mask.fieldPaths','ams_inventory_field_never_present');
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
  if(res.status===404){if(pages>0)throw Error('EXT_INVENTORY_COLLECTION_VANISHED');total=0;break}
  if(!res.ok)throw Error('EXT_INVENTORY_HTTP_'+res.status+'_'+collection);
  const data=await res.json();
  const docs=data.documents||[];
  if(!Array.isArray(docs)||docs.length>100)throw Error('EXT_INVENTORY_RESPONSE_INVALID');
  for(const doc of docs){if(typeof doc.name!=='string'||seen.has(doc.name))throw Error('EXT_INVENTORY_DUPLICATE_OR_MALFORMED');seen.add(doc.name)}
  total+=docs.length;pages++;pageToken=data.nextPageToken||'';
  if(pages>250)throw Error('EXT_INVENTORY_PAGE_LIMIT');
 }while(pageToken);
 totals[collection]=total;
}
console.log('READ_ONLY_DEV_FIRESTORE_EXTENSION_INVENTORY '+JSON.stringify(totals));
console.log('NO_DOCUMENT_VALUES_RETRIEVED_NO_WRITES_PERFORMED');
