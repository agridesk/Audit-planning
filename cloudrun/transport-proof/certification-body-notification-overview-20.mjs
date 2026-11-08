/** Read-only manager dashboard model for Certification Body notifications. */
const str=x=>String(x??'').trim();
const yes=x=>/^(yes|true|1)$/i.test(str(x));
const table=(values,required,name)=>{
 if(!Array.isArray(values)||!Array.isArray(values[0])||required.some(k=>!values[0].includes(k)))throw Error('CB_DASHBOARD_'+name+'_SCHEMA');
 const h=values[0];
 return{rows:values.slice(1),get:(r,k)=>str(r[h.indexOf(k)])};
};
export function buildCbNotificationOverview20({bodies=[],scopes=[],outbox=[],config=[]}={}){
 const b=table(bodies,['Certification_Body_ID','Display_Name','Active','Notification_Email','Email_Verified','Notification_Enabled'],'BODIES');
 const s=table(scopes,['ScopeCode','Certification_Body_ID','Active'],'SCOPES');
 const o=table(outbox,['Event_ID','Certification_Body_ID','Status'],'OUTBOX');
 const c=table(config,['EVENT_KEY','ACTIVE','SEND_EMAIL','BUFFER_MINUTES'],'CONFIG');
 const cbCodes=new Set(),items=[],eventKeys=['CB_EXTENSION_APPLIED','CB_EXTENSION_UNDONE'];
 const policy=eventKeys.map(key=>{
  const found=c.rows.filter(r=>c.get(r,'EVENT_KEY')===key);
  if(found.length!==1)throw Error('CB_DASHBOARD_CONFIG_MISSING_OR_DUPLICATE_'+key);
  const delay=Number(c.get(found[0],'BUFFER_MINUTES'));
  return{eventKey:key,active:yes(c.get(found[0],'ACTIVE')),sendEmail:yes(c.get(found[0],'SEND_EMAIL')),
   bufferMinutes:Number.isFinite(delay)?delay:null,validBuffer:Number.isSafeInteger(delay)&&delay>=10};
 });
 for(const r of b.rows){
  const id=b.get(r,'Certification_Body_ID');if(!id)continue;
  if(cbCodes.has(id))throw Error('CB_DASHBOARD_DUPLICATE_BODY');
  cbCodes.add(id);
  const associated=s.rows.filter(x=>s.get(x,'Certification_Body_ID')===id&&s.get(x,'ScopeCode'));
  const statusCounts={};
  for(const ev of o.rows.filter(x=>o.get(x,'Certification_Body_ID')===id&&o.get(x,'Event_ID'))){
   const status=o.get(ev,'Status')||'UNKNOWN';statusCounts[status]=(statusCounts[status]||0)+1;
  }
  const active=yes(b.get(r,'Active')),emailVerified=yes(b.get(r,'Email_Verified')),
    notificationsEnabled=yes(b.get(r,'Notification_Enabled')),notificationEmail=b.get(r,'Notification_Email');
  const ready=active&&emailVerified&&notificationsEnabled&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)
    &&policy.every(e=>e.active&&e.sendEmail&&e.validBuffer);
  items.push({certificationBodyId:id,displayName:b.get(r,'Display_Name'),active,notificationEmail,emailVerified,
   notificationsEnabled,scopeCount:associated.length,activeScopeCount:associated.filter(x=>yes(s.get(x,'Active'))).length,
   statusCounts,readyForExternalDelivery:ready});
 }
 const unknownScopes=s.rows.filter(r=>s.get(r,'ScopeCode')&&yes(s.get(r,'Active'))&&!cbCodes.has(s.get(r,'Certification_Body_ID')));
 const unknownEvents=o.rows.filter(r=>o.get(r,'Event_ID')&&!cbCodes.has(o.get(r,'Certification_Body_ID')));
 return{certificationBodies:items,eventPolicies:policy,unknownActiveScopeCount:unknownScopes.length,
  unknownEventBodyCount:unknownEvents.length,readOnly:true,
  externalDeliveryGate:'REQUIRES_BODY_VERIFICATION_AND_EVENT_ENABLEMENT',
  legacyEcasRoutingNotMigrated:true};
}
