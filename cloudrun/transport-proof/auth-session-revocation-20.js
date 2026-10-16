import {createHash} from 'node:crypto';
// DEV-only persistent logout denylist shared by all Cloud Run instances.
export function createSessionRevocationStore({projectId,getAccessToken,fetchImpl=fetch}={}){
  if(projectId!=='audit-management-system-dev'||typeof getAccessToken!=='function')throw Error('AUTH_REVOCATION_DEV_CONFIGURATION_REQUIRED');
  const base='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents/ams_auth_revocations_dev';
  function id(raw){return createHash('sha256').update(String(raw||'')).digest('hex');}
  async function call(url,options={}){
    const token=await getAccessToken();if(!token)throw Error('AUTH_REVOCATION_TOKEN_MISSING');
    const r=await fetchImpl(url,{...options,headers:{authorization:'Bearer '+token,...(options.body?{'content-type':'application/json'}:{})}});
    return r;
  }
  async function isRevoked(raw){
    if(!raw) return true;
    const r=await call(base+'/'+id(raw));
    if(r.status===404)return false;
    if(!r.ok)throw Error('AUTH_REVOCATION_READ_'+r.status);
    return true;
  }
  async function revoke(raw,expirySeconds){
    if(!raw||!Number.isSafeInteger(expirySeconds)||expirySeconds<=Math.floor(Date.now()/1000))throw Error('AUTH_REVOCATION_INPUT_INVALID');
    const tokenHash=id(raw),url=base+'?documentId='+tokenHash;
    const body={fields:{expiresAt:{timestampValue:new Date(expirySeconds*1000).toISOString()},createdAt:{timestampValue:new Date().toISOString()}}};
    const r=await call(url,{method:'POST',body:JSON.stringify(body)});
    if(r.status===409)return {ok:true,alreadyRevoked:true};
    if(!r.ok)throw Error('AUTH_REVOCATION_WRITE_'+r.status);
    return {ok:true,alreadyRevoked:false};
  }
  return {isRevoked,revoke};
}
