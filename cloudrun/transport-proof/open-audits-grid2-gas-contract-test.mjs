import fs from 'node:fs';
const entry=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const svc=fs.readFileSync(new URL('../../OpenAuditsGrid2Service.js',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../../ManagerPlanningBackend_CORE_SPLIT.js',import.meta.url),'utf8');
const ext=fs.readFileSync(new URL('../../AuditPlanningModelCExtensionService.js',import.meta.url),'utf8');
const auditorBackend=fs.readFileSync(new URL('../../AuditorV5Backend.js',import.meta.url),'utf8');
const auditorPortal=fs.readFileSync(new URL('../../AuditorPortalV5.html',import.meta.url),'utf8');
const checks=[
['secure enrichment bridge',entry.includes("rawAction==='externalmanageropenenriched'")&&entry.includes('V5_ENTRY_externalBridgeBody_')],
['secure extension bridge',entry.includes("rawAction==='externalmanagerextension'")&&entry.includes('V5_ENTRY_externalBridgeBody_')],
['DEV only bridges',entry.includes("if(!V5_ENTRY_isDevEnv_())")],
['bridge key stays Script Property owned',entry.includes("getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY')")],
['canonical bulk enrichment reused',svc.includes("typeof getManagerV5OpenEnriched==='function'")&&svc.includes('getManagerV5OpenEnriched(ids)')],
['canonical apply extension reused',svc.includes("typeof v5_applyExtension==='function'")&&svc.includes("command==='apply'")],
['canonical undo extension reused',svc.includes("typeof v5_undoExtension==='function'")],
['Model C owner asserted',svc.includes("typeof ModelCExtension_commit==='function'")],
['extension external-annual detection has no undefined legacy helper',ext.includes('ModelCExtension_isExternalAnnualObligation_')&&!ext.includes('ModelCFoundation_isAbc_')],
['canonical reservation read model reused',svc.includes("typeof ConceptReservationReadModel_get!=='function'")&&svc.includes('ConceptReservationReadModel_get({from:min,to:max})')],
['active concept reservations projected provisional only',svc.includes('r.provisionalReservationCount=rr.length')&&svc.includes('r.confirmedReservationCount=0')&&svc.includes('r.provisionalCommitted=false')],
['concept month not synthesized',svc.includes('No persisted concept-month owner exists')&&svc.includes("conceptMonthOwner:'NOT_AVAILABLE_CURRENT_MODEL'")],
['concept explicitly non committed',svc.includes('r.conceptCommitted=false')],
['provisional explicitly separate',svc.includes('hasProvisionalPlanning')&&svc.includes('provisionalIsCommitted:false')],
['extension uses full canonical Manager projection invalidation',svc.includes("typeof V5_clearManagerOpenCache_==='function'")&&svc.includes('V5_clearManagerOpenCache_(auditId)')],
['canonical invalidator clears audit planning pack',core.includes('function V5_clearManagerOpenCache_(auditId)')&&core.includes('__mp_invalidateAuditPlanningPack_()')],
['canonical invalidator clears manager namespace',core.includes("AUDIT_CACHE.removeNamespace('manager')")],
['canonical invalidator clears manager persisted grid',core.includes("MP_PERSIST::manager::single_grid_open_v1")],
['extension rereads canonical enriched row',svc.includes('var enriched=OpenAuditsGrid2_getEnriched([auditId])')],
['Auditor Grid backend separates formal, target and committed scheduled hours',auditorBackend.includes('function auditorV5_schedulingTargetForRow_(')&&auditorBackend.includes('plannedHours: formalPlannedHours')&&auditorBackend.includes('scheduledHours: committedScheduledHours')&&auditorBackend.includes('schedulingHoursTarget: schedulingTarget')],
['Auditor Grid shows scheduled hours only from committed planning',auditorPortal.includes("scheduled ' + V5.escape(String(Number(committedScheduledHours))) + ' h")&&auditorPortal.includes('r.scheduledHours')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('open-audits-grid2-gas-contract-test passed');
