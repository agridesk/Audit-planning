import fs from 'node:fs';
const entry=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const svc=fs.readFileSync(new URL('../../OpenAuditsGrid2Service.js',import.meta.url),'utf8');
const checks=[
['secure enrichment bridge',entry.includes("rawAction==='externalmanageropenenriched'")&&entry.includes('V5_ENTRY_externalBridgeBody_')],
['secure extension bridge',entry.includes("rawAction==='externalmanagerextension'")&&entry.includes('V5_ENTRY_externalBridgeBody_')],
['DEV only bridges',entry.includes("if(!V5_ENTRY_isDevEnv_())")],
['bridge key stays Script Property owned',entry.includes("getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY')")],
['canonical bulk enrichment reused',svc.includes("typeof getManagerV5OpenEnriched==='function'")&&svc.includes('getManagerV5OpenEnriched(ids)')],
['canonical apply extension reused',svc.includes("typeof v5_applyExtension==='function'")&&svc.includes("command==='apply'")],
['canonical undo extension reused',svc.includes("typeof v5_undoExtension==='function'")],
['Model C owner asserted',svc.includes("typeof ModelCExtension_commit==='function'")],
['reservation owner reused',svc.includes("typeof READ_ACTIVE_RESERVATIONS!=='function'")&&svc.includes('READ_ACTIVE_RESERVATIONS(min,max)')],
['concept month not synthesized',svc.includes('No persisted concept-month owner exists')&&svc.includes("conceptMonthOwner:'NOT_AVAILABLE_CURRENT_MODEL'")],
['concept explicitly non committed',svc.includes('r.conceptCommitted=false')],
['provisional explicitly separate',svc.includes('hasProvisionalPlanning')&&svc.includes('provisionalIsCommitted:false')],
['extension rereads canonical enriched row',svc.includes('var enriched=OpenAuditsGrid2_getEnriched([auditId])')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('open-audits-grid2-gas-contract-test passed');
