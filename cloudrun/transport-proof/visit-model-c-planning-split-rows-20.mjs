// Issue #87: canonical Audit planning projection for separating obligations.
// Pure read-model writeset. Does not issue Audit IDs, reserve rows or write.
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const norm=x=>str(x).toUpperCase().replace(/[\s-]/g,'_');
const letters=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const minutes=x=>{const value=Number(str(x).replace(',','.'));if(!Number.isFinite(value)||value<=0||Math.abs(value*60-Math.round(value*60))>1e-8)fail('COMPOSITION_PLANNING_HOURS_INVALID');return Math.round(value*60);};
const optionalIndex=(headers,...aliases)=>headers.findIndex(h=>aliases.includes(norm(h)));
export function prepareModelCPlanningVisitSplitRows20({command,planningValues,configScopeValues,newRowNumbers}={}){
 if(command?.mode!=='SEPARATELY'||command?.canCommit!==false||
   !Array.isArray(command.visits)||command.visits.length<2||!Array.isArray(planningValues)||planningValues.length<2||
   !Array.isArray(configScopeValues)||configScopeValues.length<2)
  fail('COMPOSITION_PLANNING_SOURCE_REQUIRED');
 const headers=planningValues[0],cfgHeaders=configScopeValues[0];
 if(!Array.isArray(headers)||!Array.isArray(cfgHeaders)||headers.length>92||headers.length<40)
  fail('COMPOSITION_PLANNING_SCHEMA_INCOMPLETE');
 const find=(...names)=>optionalIndex(headers,...names);
 const auditCol=find('AUDIT_ID'),uidCol=find('COMPANY_UID'),statusCol=find('STATUS'),
  assignCol=find('ASSIGNED_TO'),jsonCol=find('PLANNING_JSON'),hoursCol=find('TOTAL_AUDIT_TIME_IN_HOURS'),
  daysCol=find('TOTAL_AUDIT_TIME_IN_DAYS'),plannedCol=find('DATE_PLANNED'),approvedCol=find('DATE_APPROVED'),
  scopesCol=find('SCOPES_LIST');
 if([auditCol,uidCol,statusCol,assignCol,jsonCol,hoursCol,daysCol,plannedCol,approvedCol].some(n=>n<0))
  fail('COMPOSITION_PLANNING_REQUIRED_HEADER_MISSING');
 const cfgSlot=optionalIndex(cfgHeaders,'SLOTKEY','SLOT_KEY'),cfgCode=optionalIndex(cfgHeaders,'SCOPECODE','SCOPE_CODE');
 if(cfgSlot<0||cfgCode<0)fail('COMPOSITION_PLANNING_SCOPE_MAPPING_MISSING');
 const slotByScope=new Map(),scopeBySlot=new Map();
 for(const row of configScopeValues.slice(1)){
  const slot=str(row[cfgSlot]),code=str(row[cfgCode]);
  if(!/^SCOPE_\d{2}$/.test(slot)||!code)continue;
  if(slotByScope.has(code)||scopeBySlot.has(slot))fail('COMPOSITION_PLANNING_SCOPE_MAPPING_DUPLICATE');
  slotByScope.set(code,slot);scopeBySlot.set(slot,code);
 }
 const source=planningValues.slice(1).map((row,i)=>({row,number:i+2})).filter(x=>str(x.row[auditCol])===command.auditId);
 if(source.length!==1)fail('COMPOSITION_PLANNING_SOURCE_NOT_UNIQUE');
 if(str(source[0].row[uidCol])!==command.companyUid||
    norm(source[0].row[statusCol])!=='PENDING_PLANNING')fail('COMPOSITION_PLANNING_SOURCE_STATUS_OR_OWNER_INVALID');
 const before=Array.from({length:headers.length},(_,i)=>source[0].row[i]??'');
 if([assignCol,jsonCol,plannedCol,approvedCol].some(i=>str(before[i]))||
    (scopesCol>=0&&str(before[scopesCol]))||str(before[daysCol]))
  fail('COMPOSITION_PLANNING_EXISTING_STATE_REQUIRES_MIGRATION');
 const expected=new Map();
 for(const obligation of command.visits){
  const code=str(obligation.obligationId);
  if(!code||expected.has(code))fail('COMPOSITION_PLANNING_OBLIGATION_PARTITION_INVALID');
  expected.set(code,obligation);
 }
 const required=new Map(),activeSlots=[];
 for(const obligation of command.obligationIds){
  const visit=expected.get(obligation);
  if(!visit)fail('COMPOSITION_PLANNING_OBLIGATION_PARTITION_INVALID');
  const mapping=command.obligations?.find(x=>x.obligationId===obligation);
  if(!mapping)fail('COMPOSITION_PLANNING_SCOPE_HOURS_REQUIRED');
  const slot=slotByScope.get(mapping.scopeCode);
  if(!slot)fail('COMPOSITION_PLANNING_SCOPE_NOT_IN_CONFIG');
  const flagCol=find(slot),durationCol=find('DURATION_'+slot);
  if(flagCol<0||durationCol<0||norm(before[flagCol])!=='X'||
     minutes(before[durationCol])!==mapping.requiredMinutes)
   fail('COMPOSITION_PLANNING_SOURCE_SCOPE_MISMATCH');
  required.set(obligation,{slot,flagCol,durationCol,minutes:mapping.requiredMinutes});
  activeSlots.push(slot);
 }
 const slotColumns=[];
 for(const [slot] of scopeBySlot){
  const flagCol=find(slot),durationCol=find('DURATION_'+slot);
  if(flagCol<0||durationCol<0)continue;
  const active=norm(before[flagCol])==='X';
  if(active&&!activeSlots.includes(slot))fail('COMPOSITION_PLANNING_EXTRA_SOURCE_SCOPE');
  if(!active&&(str(before[flagCol])||str(before[durationCol])))
   fail('COMPOSITION_PLANNING_UNEXPECTED_SCOPE_DATA');
  slotColumns.push({slot,flagCol,durationCol});
 }
 const total=[...required.values()].reduce((n,x)=>n+x.minutes,0);
 if(minutes(before[hoursCol])!==total||total!==command.totalMinutes)
  fail('COMPOSITION_PLANNING_SOURCE_TOTAL_MISMATCH');
 const newVisits=command.visits.filter(x=>x.auditId!==command.auditId);
 if(!Array.isArray(newRowNumbers)||newRowNumbers.length!==newVisits.length||
    new Set(newRowNumbers).size!==newVisits.length||newRowNumbers.some(n=>!Number.isSafeInteger(n)||n<=planningValues.length))
  fail('COMPOSITION_PLANNING_NEW_ROWS_UNVERIFIED');
 const allIds=new Set(planningValues.slice(1).map(r=>str(r[auditCol])).filter(Boolean));
 if(newVisits.some(x=>allIds.has(x.auditId)))fail('COMPOSITION_PLANNING_NEW_ID_COLLISION');
 const width=letters(headers.length),projectionWrites=[],projectionPreconditions=[];
 const build=(visit)=>{
  const allocation=required.get(visit.obligationId);
  if(!allocation)fail('COMPOSITION_PLANNING_OBLIGATION_PARTITION_INVALID');
  const row=[...before];
  row[auditCol]=visit.auditId;
  for(const {flagCol,durationCol} of slotColumns){row[flagCol]='';row[durationCol]='';}
  row[allocation.flagCol]='x';
  row[allocation.durationCol]=String(allocation.minutes/60);
  row[hoursCol]=(allocation.minutes/60).toFixed(2);
  if(visit.auditId!==command.auditId){
   for(const n of ['LAST_MANAGER_DECISION','LAST_DECISION_TIMESTAMP','STATUS_SINCE','MANAGER_COMMENT_LAST',
      'LAST_AUDITOR_DECISION','LAST_AUDITOR_DECISION_TIMESTAMP','AUDITOR_COMMENT_LAST']){
    const i=find(n);if(i>=0)row[i]='';
   }
  }
  return row;
 };
 for(const visit of command.visits){
  const isSource=visit.auditId===command.auditId;
  const n=isSource?source[0].number:newRowNumbers[newVisits.indexOf(visit)];
  const range='Audit planning!A'+n+':'+width+n;
  projectionWrites.push({range,values:[build(visit)]});
  projectionPreconditions.push({range,before:isSource?before:[]});
 }
 return Object.freeze({mode:'SEPARATELY',sourceAuditId:command.auditId,
  projectedAuditIds:command.visits.map(x=>x.auditId),projectionWrites,projectionPreconditions,
  canCommit:false,requiresCanonicalIdentity:true,requiresVerifiedEmptyTargetRows:true});
}
