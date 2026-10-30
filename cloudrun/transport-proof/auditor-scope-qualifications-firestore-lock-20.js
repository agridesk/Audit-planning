// Dedicated DEV qualification migration lock; separate from auditor email cutover.
// A stale or uncertain lock is never deleted automatically.
export async function withQualificationMigrationFirestoreLock20({project,spreadsheetId,token,fetchFn,randomId,work}={}){
 if(project!=='audit-management-system-dev'||spreadsheetId!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('QUALIFICATION_LOCK_DEV_BOUNDARY');
 if(typeof fetchFn!=='function'||typeof randomId!=='function'||typeof work!=='function'||!token)throw Error('QUALIFICATION_LOCK_DEPENDENCY_MISSING');
 const doc='scope20_auditor_qualifications';
 const collection='ams_scope20_migration_locks';
 const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'+collection;
 const headers={authorization:'Bearer '+token};
 const probe=await fetchFn(base+'/'+doc,{headers});
 if(probe.ok)throw Error('QUALIFICATION_LOCK_PRESENT_RECONCILIATION_REQUIRED');
 if(probe.status!==404)throw Error('QUALIFICATION_LOCK_READ_FAILED_'+probe.status);
 let response;
 try{response=await fetchFn(base+'?documentId='+doc,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({fields:{holder:{stringValue:randomId()},purpose:{stringValue:'SCOPE20_DEV_QUALIFICATION_MIGRATION'}}})});}
 catch(e){throw Error('QUALIFICATION_LOCK_ACQUIRE_UNCERTAIN_RECONCILIATION_REQUIRED');}
 if(response.status===409)throw Error('QUALIFICATION_LOCK_BUSY');
 if(!response.ok)throw Error('QUALIFICATION_LOCK_CREATE_FAILED_'+response.status);
 let acquired;
 try{acquired=await response.json();}catch(e){throw Error('QUALIFICATION_LOCK_RESPONSE_UNCERTAIN_RECONCILIATION_REQUIRED');}
 if(!acquired?.updateTime||!String(acquired.name||'').endsWith('/'+collection+'/'+doc))throw Error('QUALIFICATION_LOCK_VERSION_UNCONFIRMED_RECONCILIATION_REQUIRED');
 let output,failed;
 try{output=await work();}catch(e){failed=e;}
 // Any uncertain Sheets write keeps lock until explicitly reconciled.
 if(failed&&/UNCONFIRMED|RECONCILE|APPEND|STALE_BEFORE_APPEND/.test(String(failed.message)))throw Error('QUALIFICATION_MIGRATION_RECONCILIATION_REQUIRED: '+failed.message);
 let released;
 try{released=await fetchFn(base+'/'+doc+'?currentDocument.updateTime='+encodeURIComponent(acquired.updateTime),{method:'DELETE',headers});}
 catch(e){throw Error('QUALIFICATION_LOCK_RELEASE_UNCERTAIN_RECONCILIATION_REQUIRED');}
 if(!released.ok)throw Error('QUALIFICATION_LOCK_RELEASE_FAILED_'+released.status);
 if(failed)throw failed;
 return output;
}
