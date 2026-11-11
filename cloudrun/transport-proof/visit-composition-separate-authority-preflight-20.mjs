/**
 * Issue #87. Materialize authoritative DEV-only SEPARATELY transaction evidence
 * from fresh canonical row sets. No Sheets/Firestore mutation in this module.
 * The caller owns the global write gate, source backfill CAS and live leases.
 */
import {createHash} from 'node:crypto';
import {v211AssignmentHardCheck} from './assignment-validation-v211.js';
import {buildRotationManager20} from './rotation-manager-20.mjs';
const clean=x=>String(x??'').trim();
const norm=x=>clean(x).toLowerCase().replace(/[^a-z0-9]/g,'');
const status=x=>clean(x).toUpperCase().replace(/[\s-]+/g,'_');
const yes=x=>['true','yes','x','1'].includes(clean(x).toLowerCase());
const sha=x=>createHash('sha256').update(x).digest('hex');
const md5=x=>createHash('md5').update(x).digest('hex');
const idx=(h,...names)=>{const hs=(h||[]).map(norm);for(const n of names){const i=hs.indexOf(norm(n));if(i>=0)return i;}return -1;};
const required=(h,name)=>{const i=idx(h,name);if(i<0)throw Error('COMPOSITION_SPLIT_SCHEMA_MISSING_'+name);return i;};
const val=(r,i)=>i<0?'':clean(r?.[i]);
const isoDate=x=>{const s=clean(x).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('COMPOSITION_SPLIT_DATE_INVALID');return s;};
const minute=x=>{if(!/^([01]\d|2[0-3]):(?:00|15|30|45)$/.test(clean(x)))throw Error('COMPOSITION_SPLIT_TIME_QUARTER_INVALID');return Number(x.slice(0,2))*60+Number(x.slice(3));};
const endCol=n=>{let out='';for(let x=n;x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;return out;};
const clone=x=>structuredClone(x);
function fingerprint(h,r){
 const fields=[val(r,idx(h,'Audit ID')),val(r,idx(h,'Status')),
  val(r,idx(h,'Assigned to')),val(r,idx(h,'Planning JSON')),
  val(r,idx(h,'Last decision timestamp')),val(r,idx(h,'Status since'))];
 const uid=val(r,idx(h,'Auditor_UID'));
 return sha(fields.join('|')+(uid?'|'+uid:'')).slice(0,24);
}
function table(a,name){if(!Array.isArray(a)||!Array.isArray(a[0])||!a[0].length||a.length>=5000)throw Error('COMPOSITION_SPLIT_SOURCE_UNAVAILABLE_'+name);return a;}
function rawWrites(){const writes=[],preconditions=[];
 return {writes,preconditions,add(range,after,before){
  if(writes.some(x=>x.range===range))throw Error('COMPOSITION_SPLIT_DUPLICATE_WRITE_TARGET');
  writes.push({range,values:[after]});preconditions.push({range,before});
 }};}
export function prepareSeparateCompositionAuthority20({
 actor,body,sourceCanonical,planningRows,obligationRows,linkRows,scopeRows,
 auditorRows,qualificationRows,companyRows,realizedRows,reservationRows,
 availabilityRows,availabilityVersions,now=new Date().toISOString()
}={}){
 if(actor?.role!=='manager'||!clean(actor.auditorId)||!body||body.composition!=='SEPARATELY'||
    !clean(body.auditId)||!clean(body.sourceRevision)||!Array.isArray(body.visits))
  throw Error('COMPOSITION_SPLIT_MANAGER_REQUEST_INVALID');
 const auditId=clean(body.auditId),proposals=body.visits;
 if(!Number.isFinite(Date.parse(now))||proposals.length<2||proposals.length>15)
  throw Error('COMPOSITION_SPLIT_INPUT_INVALID');
 for(const [name,rows] of Object.entries({planningRows,obligationRows,linkRows,scopeRows,
   auditorRows,qualificationRows,companyRows,realizedRows,reservationRows,availabilityRows}))
  table(rows,name);
 const ph=planningRows[0],pi=required(ph,'Audit ID'),
  ps=required(ph,'Status'),pc=required(ph,'Company_UID'),
  pj=required(ph,'Planning JSON'),pAssigned=required(ph,'Assigned to'),
  pAuditorUid=required(ph,'Auditor_UID'),pDate=required(ph,'Date - Planned'),
  pApproved=required(ph,'Date - Approved'),pHours=required(ph,'Total audit time in hours'),
  pDays=required(ph,'Total audit time in days'),pScopes=required(ph,'Scopes_List'),
  pDecision=required(ph,'Last manager decision'),pTimestamp=required(ph,'Last decision timestamp'),
  pStatusSince=required(ph,'Status since');
 if(ph.length>92||ph.length<40)throw Error('COMPOSITION_SPLIT_PLANNING_WIDTH_INVALID');
 const sourceMatches=planningRows.slice(1).map((row,i)=>({row,rowNumber:i+2})).filter(x=>val(x.row,pi)===auditId);
 if(sourceMatches.length!==1)throw Error('COMPOSITION_SPLIT_SOURCE_ROW_IDENTITY_INVALID');
 const source=sourceMatches[0],before=source.row,companyUid=val(before,pc),
  companyName=val(before,idx(ph,'Company'));
 if(!companyUid||!companyName||status(before[ps])!=='PENDING_PLANNING')
  throw Error('COMPOSITION_SPLIT_SOURCE_LIFECYCLE_INVALID');
 if(fingerprint(ph,before)!==body.sourceRevision)
  throw Error('COMPOSITION_SPLIT_SOURCE_REVISION_STALE');
 if(!sourceCanonical||sourceCanonical.removed===true||
    !Number.isSafeInteger(sourceCanonical.revision)||sourceCanonical.pendingOperationId||
    sourceCanonical.snapshot?.sourceRevision!==body.sourceRevision||
    status(sourceCanonical.snapshot?.status)!=='PENDING_PLANNING')
  throw Error('COMPOSITION_SPLIT_FIRESTORE_SOURCE_CAS_INVALID');
 let originalPlanning;
 try{originalPlanning=val(before,pj)?JSON.parse(val(before,pj)):{};}
 catch{throw Error('COMPOSITION_SPLIT_SOURCE_PLANNING_JSON_INVALID');}
 if(originalPlanning?.identityRetired===true||(originalPlanning?.blocks?.length||0)>0)
  throw Error('COMPOSITION_SPLIT_SOURCE_ALREADY_PLANNED_OR_RETIRED');
 const lh=linkRows[0],la=required(lh,'Audit_ID'),lo=required(lh,'Obligation_ID'),
  ls=required(lh,'Link_State'),lun=required(lh,'Unlinked_At'),linked=required(lh,'Linked_At');
 const active=linkRows.slice(1).map((row,i)=>({row,rowNumber:i+2})).filter(x=>status(x.row[ls])==='ACTIVE');
 const sourceLinks=active.filter(x=>val(x.row,la)===auditId),ids=sourceLinks.map(x=>val(x.row,lo));
 if(ids.length!==proposals.length||ids.length<2||ids.some(x=>!x)||new Set(ids).size!==ids.length||
    active.some(x=>ids.includes(val(x.row,lo))&&val(x.row,la)!==auditId))
  throw Error('COMPOSITION_SPLIT_MODEL_C_ACTIVE_MEMBERSHIP_INVALID');
 const oh=obligationRows[0],oid=required(oh,'Obligation_ID'),oc=required(oh,'Company_UID'),
  os=required(oh,'ScopeCode'),ohrs=required(oh,'Formal_Hours'),
  oFrom=required(oh,'Planning_Window_From'),oTo=required(oh,'Planning_Window_To'),
  oState=required(oh,'Obligation_State'),oExpiry=required(oh,'Effective_Expiry_Date');
 const obligations=new Map();
 for(const row of obligationRows.slice(1)){
  const id=val(row,oid);
  if(!ids.includes(id))continue;
  if(obligations.has(id))throw Error('COMPOSITION_SPLIT_OBLIGATION_DUPLICATE');
  const rawHours=val(row,ohrs).replace(',','.'),hours=Number(rawHours),minutes=Math.round(hours*60);
  if(val(row,oc)!==companyUid||!val(row,os)||!rawHours||!Number.isFinite(hours)||
     hours<=0||!Number.isSafeInteger(minutes)||Math.abs(hours*60-minutes)>1e-9||
     !['OPEN','LINKED_TO_VISIT'].includes(status(row[oState])))
   throw Error('COMPOSITION_SPLIT_OBLIGATION_IDENTITY_OR_HOURS_INVALID');
  obligations.set(id,{id,scopeCode:val(row,os),hours,minutes,
   from:val(row,oFrom)?isoDate(val(row,oFrom)):'',
   to:val(row,oTo)?isoDate(val(row,oTo)):'',
   expiry:val(row,oExpiry)});
 }
 if(obligations.size!==ids.length)throw Error('COMPOSITION_SPLIT_OBLIGATIONS_INCOMPLETE');
 const sh=scopeRows[0],ss=required(sh,'SlotKey'),sc=required(sh,'ScopeCode'),
  sn=required(sh,'DisplayName'),sa=required(sh,'Active'),sx=required(sh,'Archived'),
  sm=required(sh,'Min_Interval_Months');
 const catalog=[],byScope=new Map();
 for(const row of scopeRows.slice(1)){
  const code=val(row,sc).toLowerCase();if(!code)continue;
  if(byScope.has(code))throw Error('COMPOSITION_SPLIT_SCOPE_CATALOG_DUPLICATE');
  const cfg={slotKey:val(row,ss),scopeCode:val(row,sc),displayName:val(row,sn),
   minIntervalMonths:Number(val(row,sm)||0),active:yes(row[sa])&&!yes(row[sx])};
  byScope.set(code,cfg);catalog.push(cfg);
 }
 const ah=auditorRows[0],ae=required(ah,'E-mail'),au=required(ah,'Auditor_UID'),
  ar=required(ah,'Role'),aa=required(ah,'Active');
 const assignments=[],seenObligations=new Set(),seenAuditIds=new Set();
 const occupied=new Map();
 for(const proposal of proposals){
  const obId=clean(proposal?.obligationId),ob=obligations.get(obId);
  if(!ob||seenObligations.has(obId))throw Error('COMPOSITION_SPLIT_CHILD_MEMBERSHIP_INVALID');
  seenObligations.add(obId);
  const cfg=byScope.get(ob.scopeCode.toLowerCase());
  if(!cfg?.active||!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(cfg.slotKey))
   throw Error('COMPOSITION_SPLIT_SCOPE_NOT_ACTIVE');
  const email=clean(proposal.auditorEmail).toLowerCase();
  const auditors=auditorRows.slice(1).filter(row=>val(row,ae).toLowerCase()===email);
  if(auditors.length!==1||!yes(auditors[0][aa])||status(auditors[0][ar])!=='AUDITOR'||
     !val(auditors[0],au))throw Error('COMPOSITION_SPLIT_AUDITOR_IDENTITY_INVALID');
  const auditorId=val(auditors[0],au),requested=proposal.blocks;
  if(!Array.isArray(requested)||!requested.length||requested.length>50)
   throw Error('COMPOSITION_SPLIT_BLOCKS_REQUIRED');
  const blocks=requested.map(b=>{
   const date=isoDate(b?.date),start=clean(b?.start),end=clean(b?.end),
    a=minute(start),z=minute(end);
   if(a>=z||ob.from&&date<ob.from||ob.to&&date>ob.to)
    throw Error('COMPOSITION_SPLIT_BLOCK_OUTSIDE_WINDOW');
   const executionType=clean(b.executionType||'ONSITE').toUpperCase();
   if(executionType!=='ONSITE')throw Error('COMPOSITION_SPLIT_OFFSITE_SCOPE_POLICY_NOT_VERIFIED');
   const execLoc=clean(b.execLoc||b.executionLocation||'HQ');
   if(!execLoc)throw Error('COMPOSITION_SPLIT_LOCATION_REQUIRED');
   const dayKey=auditorId+'|'+date,prev=occupied.get(dayKey)||[];
   if(prev.some(x=>a<x.end&&z>x.start))throw Error('COMPOSITION_SPLIT_AUDITOR_SELF_OVERLAP');
   prev.push({start:a,end:z});occupied.set(dayKey,prev);
   return {date,start,end,hours:(z-a)/60,executionType,execLoc,slotComment:clean(b.slotComment)};
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  if(new Set(blocks.map(x=>x.date)).size>5||blocks.reduce((n,b)=>n+Math.round(b.hours*60),0)!==ob.minutes)
   throw Error('COMPOSITION_SPLIT_FORMAL_MINUTES_MISMATCH');
  const hard=v211AssignmentHardCheck({auditorEmail:email,auditorValues:auditorRows,
    catalog,scopeCodes:[ob.scopeCode],companyValues:companyRows,
    companyUid,companyName,logValues:realizedRows,
    requestedDates:blocks.map(x=>x.date),qualificationRelations:qualificationRows,
    requireCanonicalQualifications:true});
  if(!hard.ok)throw Error('COMPOSITION_SPLIT_ASSIGNMENT_BLOCKED_'+hard.reasons[0]);
  const visitId='VIS-'+sha(['AMS_SPLIT_V1',auditId,companyUid,obId].join('|')).slice(0,20).toUpperCase();
  if(seenAuditIds.has(visitId)||planningRows.slice(1).some(row=>val(row,pi)===visitId))
   throw Error('COMPOSITION_SPLIT_SUCCESSOR_ID_COLLISION');
  seenAuditIds.add(visitId);
  assignments.push({ob,cfg,visitId,auditorId,auditorEmail:email,
   auditorName:val(auditors[0],idx(ah,'Name'))||email,blocks});
 }
 if(seenObligations.size!==ids.length)throw Error('COMPOSITION_SPLIT_UNASSIGNED_OBLIGATION');
 // The canonical rotation manager includes historic consecutive-year rules.
 const rotation=buildRotationManager20(scopeRows,auditorRows,realizedRows);
 if(!rotation?.success||!Array.isArray(rotation.rows))throw Error('COMPOSITION_SPLIT_ROTATION_UNVERIFIED');
 for(const x of assignments){
  const line=rotation.rows.filter(r=>r.companyUid===companyUid&&r.slot===x.cfg.slotKey&&
   r.auditorUid===x.auditorId);
  if(line.some(r=>r.status==='AT_LIMIT'||r.status==='REVIEW_REQUIRED'))
   throw Error('COMPOSITION_SPLIT_ROTATION_LIMIT');
 }
 // An active Concept Reservation is not transferred silently in the split.
 const rh=reservationRows[0],rId=required(rh,'Audit ID'),
  rState=required(rh,'State');
 const avh=availabilityRows[0],vDate=required(avh,'Date'),
  vEmail=idx(avh,'Auditor_Email','Auditor Email','Email'),
  vAv=required(avh,'Available'),vId1=required(avh,'Audit_ID_1'),
  vId2=required(avh,'Audit_ID_2'),
  vStart1=required(avh,'First_Audit_Start_Time'),
  vEnd1=required(avh,'First_Audit_End_Time'),
  vStart2=required(avh,'Second_Audit_Start_Time'),
  vEnd2=required(avh,'Second_Audit_End_Time'),
  vStatus1=required(avh,'Status_1'),vStatus2=required(avh,'Status_2'),
  vUpdated=idx(avh,'Last_Updated');
 if(vEmail<0||avh.length>28)throw Error('COMPOSITION_SPLIT_AVAILABILITY_SCHEMA_INVALID');
 if(availabilityRows.slice(1).some(row=>val(row,vId1)===auditId||val(row,vId2)===auditId))
  throw Error('COMPOSITION_SPLIT_SOURCE_LEGACY_AVAILABILITY_MUST_BE_RELEASED');
 const pending=new Map(),initialLength=availabilityRows.length;
 const padded=(row,width)=>Array.from({length:width},(_,i)=>row?.[i]??'');
 for(const x of assignments)for(const block of x.blocks){
  const key=x.auditorEmail+'|'+block.date;
  let item=pending.get(key);
  if(!item){
   const matches=availabilityRows.slice(1).map((row,i)=>({row,rowNumber:i+2}))
    .filter(z=>val(z.row,vEmail).toLowerCase()===x.auditorEmail&&
     clean(z.row[vDate]).slice(0,10)===block.date);
   if(matches.length>1)throw Error('COMPOSITION_SPLIT_AVAILABILITY_DATE_ROW_DUPLICATE');
   const rowNumber=matches.length?matches[0].rowNumber:initialLength+pending.size+1,
    prior=matches.length?padded(matches[0].row,avh.length):[],
    row=matches.length?padded(matches[0].row,avh.length):Array(avh.length).fill('');
   if(!matches.length){row[vDate]=block.date;row[vEmail]=x.auditorEmail;row[vAv]='YES';}
   item={rowNumber,before:prior,row,slots:0};pending.set(key,item);
  }
  const slotConfigs=[
   {id:vId1,start:vStart1,end:vEnd1,state:vStatus1},
   {id:vId2,start:vStart2,end:vEnd2,state:vStatus2}
  ];
  const a=minute(block.start),z=minute(block.end);
  if(slotConfigs.some(s=>val(item.row,s.id)&&
   a<minute(item.row[s.end])&&z>minute(item.row[s.start])))
   throw Error('COMPOSITION_SPLIT_AVAILABILITY_OCCUPIED');
  const chosen=slotConfigs.find(s=>!val(item.row,s.id)&&!val(item.row,s.state));
  if(!chosen)throw Error('COMPOSITION_SPLIT_AVAILABILITY_CAPACITY_EXHAUSTED');
  if(!yes(item.row[vAv])&&!slotConfigs.some(s=>val(item.row,s.id)))
   throw Error('COMPOSITION_SPLIT_AVAILABILITY_HARD_BLOCK_UNVERIFIED');
  item.row[chosen.id]=x.visitId;
  item.row[chosen.start]=block.start;item.row[chosen.end]=block.end;
  item.row[chosen.state]='Manager Planned';item.row[vAv]='NO';
  if(vUpdated>=0)item.row[vUpdated]=now;
 }
 const write=rawWrites();
 // Release only source-owned active concept reservations through the same
 // outbox writeset. Other auditors' reservations are never silently removed.
 const rUpdated=idx(rh,'Updated At'),rReleased=idx(rh,'Released At'),
  rBy=idx(rh,'Released By'),rReason=idx(rh,'Release Reason');
 for(let i=1;i<reservationRows.length;i++){
  const row=reservationRows[i];
  if(val(row,rId)!==auditId||status(row[rState])!=='ACTIVE')continue;
  const after=padded(row,rh.length);after[rState]='RELEASED';
  if(rUpdated>=0)after[rUpdated]=now;
  if(rReleased>=0)after[rReleased]=now;
  if(rBy>=0)after[rBy]=clean(actor.email);
  if(rReason>=0)after[rReason]='VISIT_COMPOSITION_SPLIT';
  write.add('Concept Reservations!A'+(i+1)+':'+endCol(rh.length)+(i+1),after,clone(row));
 }
 const old=clone(before),sourceAfter=padded(before,ph.length);
 const lineage=assignments.map(x=>x.visitId);
 sourceAfter[pj]=JSON.stringify({identityRetired:true,retirementReason:'VISIT_COMPOSITION_SPLIT',
  sourceAuditId:auditId,successorAuditIds:lineage,retiredAt:now});
 write.add('Audit planning!A'+source.rowNumber+':'+endCol(ph.length)+source.rowNumber,sourceAfter,old);
 for(const link of sourceLinks){
  const next=padded(link.row,lh.length);next[ls]='INACTIVE';next[lun]=now;
  write.add('Audit_Visit_Obligations!A'+link.rowNumber+':'+endCol(lh.length)+link.rowNumber,
   next,clone(link.row));
 }
 for(const item of pending.values()){
  write.add('Auditor Availability!A'+item.rowNumber+':'+endCol(avh.length)+item.rowNumber,
   item.row,item.before);
 }
 const visits=[],entities=[],newPlanning=[],newLinks=[],notifications=[],stamp=now.slice(0,16);
 const parentSnapshot={auditId,status:'Pending Planning',sourceRevision:body.sourceRevision,
  companyUid,identityRetired:true,retirementReason:'VISIT_COMPOSITION_SPLIT',
  successorAuditIds:lineage,retiredAt:now};
 entities.push({auditId,expectedRevision:sourceCanonical.revision,remove:true,
  nextSnapshot:parentSnapshot,auditorId:null,blocks:[]});
 for(const x of assignments){
  const row=padded(before,ph.length);
  for(const cfg of catalog){
   const scIdx=idx(ph,cfg.slotKey),durIdx=idx(ph,'Duration '+cfg.slotKey);
   if(scIdx<0||durIdx<0)throw Error('COMPOSITION_SPLIT_SCOPE_SLOT_COLUMN_MISSING');
   row[scIdx]='';row[durIdx]='';
  }
  row[required(ph,x.cfg.slotKey)]='X';
  row[required(ph,'Duration '+x.cfg.slotKey)]=x.ob.hours;
  row[pi]=x.visitId;row[ps]='Approved';row[pAssigned]=x.auditorEmail;
  row[pAuditorUid]=x.auditorId;row[pDate]=x.blocks[0].date;
  row[pApproved]=now.slice(0,10);row[pHours]=x.ob.hours;row[pDays]=x.ob.hours/8;
  row[pScopes]=x.cfg.displayName||x.ob.scopeCode;row[pDecision]='PLAN';
  row[pTimestamp]=now;row[pStatusSince]=now;
  const planningJson=JSON.stringify({blocks:x.blocks,formalHours:x.ob.hours,
   totalPlannedHours:x.ob.hours,offsiteHours:0,maxOffsiteHours:0,
   auditorEmail:x.auditorEmail,auditorName:x.auditorName,
   composition:'SEPARATELY',sourceAuditId:auditId,obligationId:x.ob.id});
  row[pj]=planningJson;
  const windowFrom=idx(ph,'Planning window from'),windowTo=idx(ph,'Planning window to');
  if(windowFrom<0||windowTo<0)throw Error('COMPOSITION_SPLIT_CHILD_WINDOW_COLUMNS_MISSING');
  row[windowFrom]=x.ob.from;row[windowTo]=x.ob.to;
  const expiry=idx(ph,'Date - Will Expire'),extended=idx(ph,'Extended Expiration Date'),
   extensionApplied=idx(ph,'Extension applied');
  if(expiry<0||extended<0||extensionApplied<0)
   throw Error('COMPOSITION_SPLIT_CHILD_EXPIRY_COLUMNS_MISSING');
  row[expiry]=x.ob.expiry;
  row[extended]='';row[extensionApplied]='';
  const nextRevision=fingerprint(ph,row);
  const snapshot={auditId:x.visitId,status:'Approved',sourceRevision:nextRevision,
   companyUid,sourceAuditId:auditId,obligationIds:[x.ob.id],
   auditorUid:x.auditorId,auditorEmail:x.auditorEmail,
   formalMinutes:x.ob.minutes,blocks:x.blocks,planningJson};
  visits.push({auditId:x.visitId,obligationIds:[x.ob.id],snapshot,
   auditorId:x.auditorId,auditorEmail:x.auditorEmail,
   companyUid,requiredMinutes:x.ob.minutes,blocks:x.blocks});
  entities.push({auditId:x.visitId,expectedRevision:null,remove:false,nextSnapshot:snapshot,
   auditorId:x.auditorId,blocks:x.blocks});
  newPlanning.push(row);
  const modelCLink=Array(lh.length).fill('');
  modelCLink[la]=x.visitId;modelCLink[lo]=x.ob.id;modelCLink[ls]='ACTIVE';
  modelCLink[linked]=now;newLinks.push(modelCLink);
  const event='AUDIT_PLANNED_BY_MANAGER';
  const payload={eventType:event,eventFamily:'RICH_OPERATIONAL',rendererProfile:'RICH_OPERATIONAL',
   deliveryProfile:'IMMEDIATE_RICH',auditId:x.visitId,sourceAuditId:auditId,
   company:companyName,companyUid,actor:clean(actor.email),
   actorRole:'MANAGER',recipientRole:'AUDITOR',resultStatus:'Approved',
   plannedDates:[...new Set(x.blocks.map(b=>b.date))],plannedHours:x.ob.hours,
   blocks:x.blocks,scopes:[x.ob.scopeCode],auditorEmail:x.auditorEmail,
   auditorName:x.auditorName,planningJson,
   config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,
    digestGroup:'RICH_OPERATIONAL',templateFamily:'RICH_OPERATIONAL',
    templateKeyDefault:event,fromEmail:'planning@agriqa.es',
    fromName:'Agri Quality Assurance – Audit Planning',replyTo:''}};
  const subject='Audit planned by manager – '+companyName+' – '+x.visitId;
  const bodyText=['Audit planned by manager','Company: '+companyName,'Audit ID: '+x.visitId,
   'Scope: '+x.ob.scopeCode,'Auditor: '+x.auditorName+' <'+x.auditorEmail+'>',
   'Planning: '+x.blocks.map(b=>b.date+' '+b.start+'-'+b.end).join('; '),
   'Total hours: '+x.ob.hours].join('\n');
  notifications.push([stamp,'PENDING',event,x.auditorEmail,x.visitId,companyName,
   subject,bodyText,0,'',md5(x.auditorEmail+'|'+event+'|'+x.visitId+'|'+planningJson),
   '',JSON.stringify({payload})]);
 }
 const versionKeys=new Set(assignments.map(x=>x.auditorId));
 if(!availabilityVersions||[...versionKeys].some(id=>!Number.isSafeInteger(availabilityVersions[id])||
   availabilityVersions[id]<0))
  throw Error('COMPOSITION_SPLIT_AVAILABILITY_VERSION_MISSING');
 const appendIntents=[
  {range:'Audit planning!A:CN',values:newPlanning},
  {range:'Audit_Visit_Obligations!A:F',values:newLinks},
  {range:'Notification Queue!A:M',values:notifications}
 ];
 return {success:true,authorityPreflight:true,composition:'SEPARATELY',
  sourceAuditId:auditId,expectedSourceRevision:body.sourceRevision,
  activeObligationIds:ids,visits,entities,sourceTombstone:parentSnapshot,
  projectionWrites:write.writes,projectionPreconditions:write.preconditions,
  appendIntents,planningAuditIdColumnIndex:pi,
  planningStatusColumnIndex:ps,planningJsonColumnIndex:pj,
  availabilityVersions:Object.fromEntries([...versionKeys].map(id=>[id,availabilityVersions[id]])),
  freshAvailabilityProvenance:true,qualificationsVerified:true,
  modelCLinkTransferVerified:true,notificationIntentsVerified:true,
  sourceIdentityCollisionChecked:true,sourceRevisionChecked:true,
  projectionPlan:{auditId,sourceRevision:body.sourceRevision,sourceRow:source.rowNumber},
  owner:'DEV_CANONICAL_SEPARATE_SOURCE_PREFLIGHT'};
}
