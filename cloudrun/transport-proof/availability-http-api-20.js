/** AMS Availability 2.0 Cloud Run HTTP router. Mount BEFORE generic proxy.
 * Dependencies are injected: verified session identity, canonical auditor directory,
 * and durable availability service. No identity or auditor ID is accepted from JSON as actor.
 */
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
const clean=v=>String(v??'').trim();
const isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const errorStatus=message=>/NOT_AUTHORIZED|ROLE_FORBIDDEN/.test(message)?403:/VERSION_CONFLICT|CAS_REQUIRES_FRESH_READ|PLANNING_LEASE_ACTIVE|PLANNING_LEASE_TOKEN_MISMATCH/.test(message)?409:/NOT_FOUND/.test(message)?404:/INVALID|UNSUPPORTED|OUTSIDE|CONFLICT|PERIOD_TOO_LONG|DUPLICATE|MISSING|QUERY_RANGE/.test(message)?422:500;
async function jsonBody(req,limit=16384){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>limit)throw Error('REQUEST_TOO_LARGE');}try{return JSON.parse(s);}catch{throw Error('INVALID_JSON');}}
function verifiedActor(identity){const role=clean(identity?.role).toLowerCase();const id=clean(identity?.auditorId||identity?.uid||identity?.id);if(!id||!['auditor','manager'].includes(role))throw Error('NOT_AUTHORIZED');return {id,role};}
export function createAvailabilityHttpRouter({service,resolveIdentity,listAuditors}={}){
 if(!service||typeof resolveIdentity!=='function'||typeof listAuditors!=='function')throw Error('INVALID_API_CONFIGURATION');
 return async function handle(req,res){
  const url=new URL(req.url||'/','http://localhost');
  if(!url.pathname.startsWith('/api/v1/availability/'))return false;
  const route=url.pathname.slice('/api/v1/availability/'.length);
  if(!['calendar','mutate','manager-overview','me'].includes(route)){reply(res,404,{success:false,error:'NOT_FOUND'});return true;}
  if(req.method!==(route==='mutate'?'POST':'GET')){reply(res,405,{success:false,error:'METHOD_NOT_ALLOWED'});return true;}
  let stage='SESSION';
  try{
   const identity=await resolveIdentity(req);if(!identity){reply(res,401,{success:false,error:'SESSION_REQUIRED'});return true;}
   stage='ACTOR';
   const actor=verifiedActor(identity);
   if(route==='me'){reply(res,200,{success:true,auditorId:actor.id,role:actor.role});return true;}
   if(route==='manager-overview'&&actor.role!=='manager')throw Error('ROLE_FORBIDDEN');
   stage='DIRECTORY';
   // A validated auditor session is the authoritative grant for its own UID.
   // Directory lookups are needed only for managers selecting other auditors.
   const directory=actor.role==='manager'?await listAuditors(actor):[{auditorId:actor.id,displayName:actor.id}];
   if(!Array.isArray(directory)||directory.length>2500||directory.some(x=>!x||typeof x!=='object'||Array.isArray(x)||typeof x.auditorId!=='string'||!x.auditorId.trim()))throw Error('INVALID_AUDITOR_DIRECTORY');
   const allowed=new Map(directory.map(x=>[clean(x.auditorId),clean(x.displayName)||clean(x.auditorId)]));
   if(allowed.size!==directory.length)throw Error('INVALID_AUDITOR_DIRECTORY');
   const authorizedId=id=>{const target=clean(id);if(!target||(actor.role==='auditor'?target!==actor.id:!allowed.has(target)))throw Error('NOT_AUTHORIZED');return target;};
   let result;
   if(route==='calendar'){
    stage='TARGET_AUTHORIZATION';
    const auditorId=authorizedId(url.searchParams.get('auditorId'));
    const fromDate=url.searchParams.get('fromDate'),toDate=url.searchParams.get('toDate');
    if(!isoDate(fromDate)||!isoDate(toDate))throw Error('INVALID_DATE');
    stage='PERIOD_SERVICE';
    result=await service.period({actor,auditorId,fromDate,toDate});
   }else if(route==='mutate'){
    if(!/^application\/json(?:;|$)/i.test(clean(req.headers['content-type'])))throw Error('INVALID_CONTENT_TYPE');
    stage='TARGET_AUTHORIZATION';
    const body=await jsonBody(req),auditorId=authorizedId(body.auditorId);
    if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||!body.mutation||typeof body.mutation!=='object'||Array.isArray(body.mutation))throw Error('INVALID_MUTATION');
    stage='MUTATION_SERVICE';
    result=await service.mutate({actor,auditorId,expectedVersion:body.expectedVersion,mutation:body.mutation});
   }else{
    const fromDate=url.searchParams.get('fromDate'),toDate=url.searchParams.get('toDate');
    if(!isoDate(fromDate)||!isoDate(toDate))throw Error('INVALID_DATE');
    const requested=url.searchParams.getAll('auditorId');
    const ids=requested.length?requested:[...allowed.keys()];
    if(ids.length>250||new Set(ids).size!==ids.length)throw Error('INVALID_AUDITOR_SET');
    ids.forEach(authorizedId);
    result=await service.managerOverview({actor,auditorIds:ids,fromDate,toDate,displayNames:Object.fromEntries(ids.map(id=>[id,allowed.get(id)]))});
   }
   reply(res,200,{success:true,...result});
  }catch(e){const message=clean(e?.message)||'INTERNAL_ERROR';const status=message==='REQUEST_TOO_LARGE'?413:errorStatus(message);if(status===500)console.error('Availability 2.0 backend failure:',message);reply(res,status,{success:false,error:status===500?'INTERNAL_ERROR':message,...(status===403?{diagnosticStage:stage}:{})});}
  return true;
 };
}