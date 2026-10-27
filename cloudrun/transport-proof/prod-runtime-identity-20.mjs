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

// Verify the ACTUAL Cloud Run principal before starting PROD listeners.
export async function verifyProdRuntimeIdentity(expected, fetchImpl=fetch) {
 const response=await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('AMS_PROD_RUNTIME_IDENTITY_UNVERIFIED');
 const actual=String(await response.text()).trim().toLowerCase();
 if(actual!==String(expected||'').trim().toLowerCase())throw Error('AMS_PROD_RUNTIME_IDENTITY_MISMATCH');
 return true;
}
