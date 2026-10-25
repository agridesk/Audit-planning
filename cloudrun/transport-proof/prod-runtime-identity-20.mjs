// PROD runtime identity declaration guard. Configuration check only:
// actual Cloud Run IAM principal and bindings require independent live proof.
export function resolveProdRuntimeIdentity(env, project) {
 const account=String(env.AMS_PROD_RUNTIME_SERVICE_ACCOUNT||'').trim().toLowerCase();
 const expectedSuffix='@'+project+'.iam.gserviceaccount.com';
 if(!account||!account.endsWith(expectedSuffix))throw Error('AMS_PROD_RUNTIME_SERVICE_ACCOUNT_REQUIRED');
 const localPart=account.slice(0,-expectedSuffix.length);
 if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(localPart))throw Error('AMS_PROD_RUNTIME_SERVICE_ACCOUNT_INVALID');
 if(account===String(env.AMS_DEV_RUNTIME_SERVICE_ACCOUNT||'').trim().toLowerCase())throw Error('AMS_PROD_RUNTIME_ACCOUNT_NOT_ISOLATED');
 if(/-compute@developer\.gserviceaccount\.com$/.test(account))throw Error('AMS_PROD_DEFAULT_COMPUTE_ACCOUNT_FORBIDDEN');
 return account;
}
