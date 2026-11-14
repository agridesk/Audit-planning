/** DEV cutover safety fence. Freezes the entire Cloud Run HTTP write surface,
 * including proxied legacy handlers. External GAS/Sheets writers require an
 * independent operational freeze; this module does NOT claim to stop them.
 */
export function devCutoverFreezeDecision20({isDev,freezeEnabled,method,path,backfillWriteEnabled,legacyWritersFrozen}={}){
 if(isDev!==true||freezeEnabled!==true)return {allow:true};
 const verb=String(method||'').toUpperCase();
 if(['GET','HEAD','OPTIONS'].includes(verb))return {allow:true};
 if(verb==='POST'&&new Set(['/auth/otp/request','/auth/otp/verify','/auth/dev-login','/auth/logout']).has(path))
  return {allow:true};
 if(verb==='POST'&&path==='/api/v1/planning/atomic-backfill'&&backfillWriteEnabled===true&&legacyWritersFrozen===true)
  return {allow:true,backfillOnly:true};
 return {allow:false,status:423,error:'DEV_CUTOVER_WRITES_FROZEN'};
}
