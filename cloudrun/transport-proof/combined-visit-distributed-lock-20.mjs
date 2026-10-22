// AMS 2.0 issue #45 — opt-in DEV-only cross-instance combined-visit lock.
// Firestore create-if-absent plus updateTime-conditioned delete. No automatic stale-lock deletion.
export async function withCombinedVisitDistributedLock20({enabled=false,mode='',projectId='',getToken,fetchImpl=fetch,work}={}){
 if(typeof work!=='function')throw Error('COMBINED_LOCK_WORK_REQUIRED');
 if(!enabled)return work();
 if(mode!=='DEV'||projectId!=='audit-management-system-dev')throw Error('COMBINED_LOCK_DEV_PROJECT_REQUIRED');
 if(typeof getToken!=='function')throw Error('COMBINED_LOCK_TOKEN_PROVIDER_REQUIRED');
 const token=await getToken();
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+'/databases/(default)/documents/ams_combined_visit_locks';
 const document='global',url=base+'?documentId='+document,headers={authorization:'Bearer '+token,'content-type':'application/json'};
 const identity='ams_combined_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
 let created;
 try{created=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify({fields:{holder:{stringValue:identity},createdAt:{timestampValue:new Date().toISOString()}}})});}
 catch(e){throw Error('COMBINED_LOCK_ACQUIRE_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED')}
 if(created.status===409)throw Error('COMBINED_LOCK_BUSY');
 if(!created.ok)throw Error('COMBINED_LOCK_ACQUIRE_HTTP_'+created.status);
 let body;try{body=await created.json()}catch(e){throw Error('COMBINED_LOCK_ACQUIRE_RESPONSE_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED')}
 const version=String(body?.updateTime||'');
 if(!version||!String(body?.name||'').endsWith('/ams_combined_visit_locks/'+document))throw Error('COMBINED_LOCK_VERSION_UNVERIFIED_MANUAL_RECONCILIATION_REQUIRED');
 let result,operationError;
 try{result=await work()}catch(e){operationError=e;}
 if(operationError&&/SHEETS|WRITE|APPEND|REPAIR_REQUIRED|UNCERTAIN/.test(String(operationError?.message||operationError)))throw Error('COMBINED_LOCK_MUTATION_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED: '+String(operationError?.message||operationError));
 const releaseUrl=base+'/'+document+'?currentDocument.updateTime='+encodeURIComponent(version);
 try{const released=await fetchImpl(releaseUrl,{method:'DELETE',headers:{authorization:'Bearer '+token}});
   if(!released.ok)throw Error('COMBINED_LOCK_RELEASE_HTTP_'+released.status);}
 catch(e){throw Error('COMBINED_LOCK_RELEASE_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED')}
 if(operationError)throw operationError;
 return result;
}
