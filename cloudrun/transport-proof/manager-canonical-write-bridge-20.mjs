// AMS issue #45. Server-side manager action bridge, never a browser API.
// Return null only when disabled; when enabled, failures MUST throw (no direct writer fallback).
export async function managerCanonicalWriteBridge20({enabled=false,mode='',gasWriteUrl='',bridgeKey='',auditId='',action='',actorEmail='',options={},fetchImpl=fetch}={}){
  if(!enabled)return null;
  if(mode!=='DEV')throw Error('CANONICAL_MANAGER_BRIDGE_DEV_ONLY');
  if(!['approve','cancel','reject'].includes(action))throw Error('CANONICAL_MANAGER_ACTION_NOT_MIGRATED');
  if(!gasWriteUrl||!bridgeKey)throw Error('WRITE_BRIDGE_NOT_CONFIGURED');
  if(!auditId||!actorEmail)throw Error('CANONICAL_MANAGER_ACTOR_OR_AUDIT_REQUIRED');
  const url=new URL(gasWriteUrl);if(url.protocol!=='https:')throw Error('CANONICAL_MANAGER_BRIDGE_HTTPS_REQUIRED');
  url.searchParams.set('action','externalmanageraction');
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},redirect:'follow',body:JSON.stringify({bridgeKey,auditId,managerAction:action,actorEmail,options})});
  const raw=await response.text();let result;
  try{result=JSON.parse(raw)}catch{throw Error('CANONICAL_MANAGER_BRIDGE_NON_JSON_'+response.status)}
  if(!response.ok||result?.success===false||result?.ok===false)throw Error('CANONICAL_MANAGER_BRIDGE_REJECTED_'+String(result?.error||result?.message||response.status));
  if(!result||(result.success!==true&&result.ok!==true))throw Error('CANONICAL_MANAGER_BRIDGE_UNCONFIRMED');
  return {...result,owner:'GAS_STATUS_MACHINE',canonicalBridge:true};
}
