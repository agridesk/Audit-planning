const clean=x=>String(x??'').trim();
const key=x=>clean(x).toLowerCase().replace(/[^a-z0-9]/g,'');
const find=(h,names)=>h.findIndex(x=>names.map(key).includes(key(x)));
export function diagnoseRotationUid20(auditors,completed){
 const ah=auditors?.[0]||[],ch=completed?.[0]||[];
 const ai=find(ah,['Auditor_UID']),ae=find(ah,['Email','Auditor Email']),ci=find(ch,['Auditor_UID']),ce=find(ch,['Auditor','Auditor Email','Assigned to']),cd=find(ch,['Date completed','Date','Completed Date']);
 if(ai<0||ci<0)throw Error('ROTATION_UID_DIAGNOSTIC_SCHEMA_MISSING');
 const roster=new Set(auditors.slice(1).map(r=>clean(r[ai])).filter(Boolean));
 const missing=[],unknown=[];
 for(let i=1;i<completed.length;i++){
  const row=completed[i],uid=clean(row[ci]);
  if(!uid)missing.push({sourceRow:i+1,legacyAuditor:ce<0?'':clean(row[ce]),completedDate:cd<0?'':clean(row[cd])});
  else if(!roster.has(uid))unknown.push({sourceRow:i+1,auditorUid:uid});
 }
 return{readOnly:true,canRepairAutomatically:false,rosterSize:roster.size,completedRows:Math.max(0,completed.length-1),missingUidCount:missing.length,unknownUidCount:unknown.length,missing,unknown,emailColumnPresent:ae>=0};
}
