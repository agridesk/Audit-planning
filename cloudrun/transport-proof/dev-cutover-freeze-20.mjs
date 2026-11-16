/** DEV cutover safety fence. Freezes the entire Cloud Run HTTP write surface,
 * including proxied legacy handlers. External GAS/Sheets writers require an
 * independent operational freeze; this module does NOT claim to stop them.
 */
import {planningAtomicOwnedHttpRoutes20} from './planning-atomic-cutover-guard-20.js';

const swapGridReadRoutes=new Set(["/api/v1/manager/swap20/canonical-grid-dates","/api/v1/auditor/swap20/canonical-grid-dates"]);

const swapReadOnlyRoutes=new Set([
 '/api/v1/manager/swap20/preview',
 '/api/v1/manager/swap20/eligible',
 '/api/v1/manager/swap20/diagnose',
 '/api/v1/manager/swap20/list',
 '/api/v1/manager/swap20/status',
 '/api/v1/auditor/swap20/list'
]);

export function devCutoverFreezeDecision20({isDev,freezeEnabled,method,path,backfillWriteEnabled,legacyWritersFrozen,atomicPlanningEnabled=false,swapDirectRouteEnabled=false}={}){
 if(isDev!==true||freezeEnabled!==true)return {allow:true};
 const verb=String(method||'').toUpperCase();
 if(['GET','HEAD','OPTIONS'].includes(verb))return {allow:true};
 if(verb==='POST'&&new Set(['/auth/otp/request','/auth/otp/verify','/auth/dev-login','/auth/logout']).has(path))
  return {allow:true};
 if(atomicPlanningEnabled===true&&verb==='POST'&&swapGridReadRoutes.has(path))return {allow:true};
 // These POSTs are reads through the direct Firestore transport.
 if(atomicPlanningEnabled===true&&swapDirectRouteEnabled===true&&verb==='POST'&&swapReadOnlyRoutes.has(path))
  return {allow:true};
 // In atomic mode, only explicitly owned R15 POST routes can write.
 // Fail closed on the legacy proxy, unclassified operations and other verbs.
 if(atomicPlanningEnabled===true&&verb==='POST'&&
    (planningAtomicOwnedHttpRoutes20.includes(path)||
     ['/api/v1/planning/direct-commit','/api/v1/planning/visit-composition-atomic','/api/v1/planning/atomic-recover','/api/v1/planning/atomic-forward-recover','/api/v1/planning/atomic-partial-repair','/api/v1/planning/atomic-self-planning-rescue','/api/v1/planning/atomic-composition-forward-recover'].includes(path)))
  return {allow:true,atomicOwned:true};
 if(verb==='POST'&&path==='/api/v1/planning/atomic-backfill'&&atomicPlanningEnabled!==true&&backfillWriteEnabled===true&&legacyWritersFrozen===true)
  return {allow:true,backfillOnly:true};
 return {allow:false,status:423,error:'DEV_CUTOVER_WRITES_FROZEN'};
}
