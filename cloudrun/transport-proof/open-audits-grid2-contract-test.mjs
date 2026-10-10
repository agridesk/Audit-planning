import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const recoverExtensionStart=manager.indexOf('function recoverExtension');
const runExtensionStart=manager.indexOf('function runExtension');
const recoverExtensionBody=(recoverExtensionStart>=0&&runExtensionStart>recoverExtensionStart)?manager.slice(recoverExtensionStart,runExtensionStart):'';
const runExtensionBody=runExtensionStart>=0?manager.slice(runExtensionStart):'';
const checks=[
['1.0 parity columns', ['Company','Locations','Region','GPS / Map','Scopes','Status','Expiration date','Planning window','Self planning','Date planned','To be planned','Hours planned','Auditor','Actions'].every(x=>manager.includes(x))],
['single planning entry only',!manager.includes('<th>Planning 2.0</th>')&&!manager.includes('class=\"planning2-cell\"')&&manager.includes('ui.push({key:"plan",label:"Plan"})')&&manager.includes('if(action==="plan"){var w=window.open("/planning?auditId="')],
['focused single planning link',manager.includes('/planning?auditId=')&&manager.includes('Single Planning 2.0')],
['broken overview route not exposed',html.includes('id="planningWorkspace"')&&manager.includes('workspace.disabled=true')&&!manager.includes('window.location.href="/planning"')],
['concept explicitly non committed',manager.includes('Concept only — not committed')],
['provisional explicitly non committed',manager.includes('Provisional workload — not committed planning')],
['gps supports legacy lat lon projection',manager.includes('r.lat!=null?r.lat:r.latitude')&&manager.includes('r.lon!=null?r.lon:(r.lng!=null?r.lng:r.longitude)')],
['first paint locations from Companies canonical data',r4.includes('function managerCompanyGridMeta(companyValues)')&&r4.includes("Locations_JSON")&&r4.includes('activeLocations')&&r4.includes('locationsToPlan:activeLocations')],
['first paint HQ GPS from Companies canonical data',r4.includes('hqGps')&&r4.includes('gps:hqGps')&&r4.includes('gpsData:hqGps')],
['late enrichment cannot mutate locations or HQ map',manager.includes('delete p.locationsToPlan')&&manager.includes('delete p.locs')&&manager.includes('delete p.locationCount')&&manager.includes('delete p.gps')&&manager.includes('delete p.gpsData')],
['HQ map is compact accessible pin',html.includes(".map-link:before{content:'📍'")&&manager.includes('aria-label=\\\"Open headquarters in Google Maps\\\"')],
['bulk enrichment single endpoint',manager.includes("fetch('/api/v1/manager/open-enrichment'")&&manager.includes('auditIds:ids')],
['no per audit enrichment loop fetch',!manager.includes('/api/v1/manager/open-enrichment?auditId=')],
['enrichment preserves scroll',manager.includes('var ids=all.map')&&manager.includes('window.scrollTo(sx,sy)')],
['Manager Grid does not consume Config_Scopes scheduling delta as planning truth',!r10.includes("schedulingTargetOwner:'CONFIG_SCOPES'")&&!r10.includes('r.schedulingHoursTarget=')],
['Manager Grid shows one Hours planned value only',manager.includes('function hoursPlannedCell(r){return esc(text(r.hoursPlanned))}')&&!manager.includes('scheduled "+esc(Number(scheduled))+" h')&&!html.includes('.scheduled-hours{')],
['Manager first paint has no scheduled-hours display contract',!r4.includes('scheduledHours:committedScheduledHours')&&!r4.includes('schedulingHoursTarget:schedulingTarget')],
['Manager Pending Planning clears Hours planned only',r10.includes("r.statusKey==='PENDING_PLANNING'")&&r10.includes("r.hoursPlanned='';r.plannedHours=''")&&!r10.includes("r.scheduledHours=''")],
['Manager committed Hours planned resolves from formal hours',r10.includes("formalField:'hoursPlanned'")&&r10.includes("planningTarget:'formalHours'")&&!r10.includes("scheduledOwner:'PLANNING_JSON_BLOCKS'")],

['multi-day Date planned hover uses Planning JSON blocks',manager.includes('function planningBlocks(r)')&&manager.includes('function plannedDateCell(r)')&&manager.includes('b.date+" "+b.start+"–"+b.end')],
['slot comments are included in Date planned hover',manager.includes('if(b.slotComment)line+=" · "+b.slotComment')],

['multi-day Date planned shows compact icon',manager.includes('class="multi-day-icon"')&&manager.includes('>▦</span>')&&manager.includes('bs.length>1')],['first-paint Manager rows expose Planning JSON for hover',r4.includes('planningJson:val(row,cpj)')],['extension controls use canonical active obligation linkage after enrichment',r10.includes('function managerExtensionCatalog')&&r10.includes('managerExtensionMonthsForAudit')&&r10.includes('function managerExtensionLinkedAuditIds')&&r10.includes("r.canExtend=r.statusKey==='PENDING_PLANNING'&&extMonths>0&&extensionLinked.has(clean(r.auditId))")],

['multi-day icon shares full planning tooltip',manager.includes("class=\"multi-day-icon\"'+(tip?' title=\"'+esc(tip)+'\"':'')")],['non-recurring annual planning window comes from Model C plus Config_Scopes',r10.includes('function managerAnnualWindowCatalog')&&r10.includes('managerResolvedVisitWindow')&&r10.includes("sheetValues('Audit_Obligations!A1:Z1024')")&&r10.includes("sheetValues('Audit_Visit_Obligations!A1:Z1024')")&&r10.includes("cfg.obligationCycle!=='ANNUAL'")],
['auditor UI uses display-name projection',manager.includes('assignedToDisplayName||r.auditorDisplayName')&&r10.includes('managerAuditorDisplayMap')],
['extension apply undo controls',manager.includes('Undo applied extension')&&manager.includes('Apply extension (+')],
['undo remains available after canonical apply',manager.includes('if(applied&&can)return')&&manager.includes('data-extension=\\"undo\\"')],
['extension uses canonical endpoint',runExtensionBody.includes("fetch('/api/v1/manager/extension'")],
['extension same row patch',manager.includes('mergeRowInPlace(auditId,x.patch)')],
['extension ambiguous response recovery',manager.includes('recoverExtension')&&manager.includes('rereadEnrichedAudit(auditId)')&&manager.includes('CANONICAL_EXTENSION_NOT_COMMITTED')],
['extension recovery never repeats write',recoverExtensionBody.length>0&&!recoverExtensionBody.includes('/api/v1/manager/extension')],
['extension no full reload',!manager.includes('location.reload(')],
['server bulk enrichment endpoint',r10.includes("u.pathname==='/api/v1/manager/open-enrichment'")],
['server extension endpoint',r10.includes("u.pathname==='/api/v1/manager/extension'")],
['server enrichment bridge',r10.includes("'externalmanageropenenriched'")],
['direct action layer caches Google access token',r4.includes("let accessTokenCache={token:'',expiresAt:0}")&&r4.includes("now<accessTokenCache.expiresAt-60000")&&r4.includes("Number(j.expires_in)||300")],
['manager enrichment layer caches Google access token',r10.includes("let accessTokenCache={token:'',expiresAt:0}")&&r10.includes("now<accessTokenCache.expiresAt-60000")&&r10.includes("Number(j.expires_in)||300")],
['server extension direct writer',r10.includes("/api/v1/manager/extension-direct")&&r10.includes('DIRECT_EXTENSION_PROXY_FAILED')],
['direct extension owns Model C obligation plus projection write',r4.includes('CLOUD_RUN_DIRECT_MODEL_C_EXTENSION')&&r4.includes("put('Audit_Obligations'")&&r4.includes("put('Audit planning'")&&r4.includes("u.pathname==='/api/v1/manager/extension-direct'")],
['bridge key never in browser',!manager.includes('bridgeKey')&&!html.includes('bridgeKey')],
['stable runtime chain',r10.includes("await import('./server-r9.js')")&&!r10.includes("await import('./server-r11.js')")],
['dense grid styling',html.includes('min-width:1900px')&&html.includes('.planning-chip')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('open-audits-grid2-contract-test passed');
