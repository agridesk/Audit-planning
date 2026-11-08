/** Exactly-one-audit DEV-only EXT pilot selector. Pure, never authorizes a writer. */
const txt=x=>String(x??'').trim();
const iso=x=>/^\d{4}-\d{2}-\d{2}$/.test(txt(x));
export function selectScopeExtensionDevPilot20({manifest,expectedSha256}={}){
 if(manifest?.readOnly!==true||manifest.writeAuthorized!==false||manifest.sourceManifest!==expectedSha256
 ||!(/^[a-f0-9]{64}$/.test(txt(expectedSha256)))||manifest.obligations?.length!==199||manifest.contexts?.length!==105
 ||manifest.stats?.activeLinks!==155||manifest.stats?.historicalUnlinked!==44)throw Error('EXT_PILOT_SOURCE_INVALID');
 const byOb=new Map(manifest.obligations.map(x=>[x.obligationId,x]));
 const options=[];
 for(const ctx of manifest.contexts){
  if(ctx.lifecycleStatus!=='PENDING_PLANNING'||ctx.writerFenceVerified!==false||ctx.migrationState!=='STAGED_UNVERIFIED'
   ||!Array.isArray(ctx.obligationIds)||ctx.obligationIds.length!==1)continue;
  const ob=byOb.get(ctx.obligationIds[0]);
  if(!ob||ob.auditId!==ctx.auditId||ob.companyUid!==ctx.companyUid||ob.linkState!=='ACTIVE'||ob.triggerSource==='ECAS'
   ||ob.expiryManaged!==true||ob.extensionApplied!==false||txt(ob.extensionMetadata)||ob.legacyApplyQuarantined!==false
   ||ob.legacyUndoQuarantined!==false||ob.legacyDateQuarantined!==false||ob.revision!==0||ob.pendingProjectionId!==''
   ||!iso(ob.baseExpiry)||!iso(ob.effectiveExpiry)||!iso(ob.windowFrom)||!iso(ob.windowTo)
   ||!ctx.policyByScope?.[ob.scopeCode])continue;
  options.push({auditId:ctx.auditId,companyUid:ctx.companyUid,obligationId:ob.obligationId,scopeCode:ob.scopeCode,sourceManifestSha256:expectedSha256});
 }
 options.sort((a,b)=>a.auditId.localeCompare(b.auditId));
 return Object.freeze({ok:true,readOnly:true,writerEnabled:false,candidateCount:options.length,candidates:options});
}
