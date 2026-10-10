// BUILD: 2026-10-04_ASSIGNMENT_VALIDATION_V211_R1
// Pure shared assignment/eligibility rules for Planning 2.0.
// No sheet/network access; callers provide current canonical row sets.

function clean(v){return String(v==null?'':v).trim();}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function yes(v){const s=clean(v).toLowerCase();return s==='x'||s==='yes'||s==='true'||s==='1'||s==='ja';}
function col(h,names){
  const m={};(h||[]).forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});
  for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}
  return -1;
}
function val(r,i){return i>=0?clean((r||[])[i]):'';}
function dateOnly(v){const s=clean(v),m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}
function addMonthsIso(iso,n){
  const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
  let t=Number(m[1])*12+Number(m[2])-1+Number(n||0),y=Math.floor(t/12),mo=t-y*12+1;
  const d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo,0)).getUTCDate());
  return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

export function v211CompanyAuditorExclusions(values,companyUid,companyName){
  const out=new Set();if(!Array.isArray(values)||!values.length)return out;
  const h=values[0],cu=col(h,['Company_UID','Company UID','UID']),cn=col(h,['Company']),cx=col(h,['Auditor_Exclusions','Auditor Exclusions','Auditor exclusions']);
  if(cx<0)return out;
  const uid=key(companyUid),name=key(companyName);let row=null;
  for(const r of values.slice(1)){
    if(uid&&cu>=0&&key(r[cu])===uid){row=r;break;}
    if(!row&&(!uid||cu<0)&&name&&cn>=0&&key(r[cn])===name)row=r;
  }
  if(!row)return out;
  if(uid&&cu>=0&&values.slice(1).filter(r=>key(val(r,cu))===uid).length!==1)return out;
  if((!uid||cu<0)&&name&&cn>=0){
    const nameMatches=values.slice(1).filter(r=>key(val(r,cn))===name);
    if(nameMatches.length!==1)return out;
  }
  const raw=clean(row[cx]);if(!raw)return out;
  const add=v=>{const s=clean(v).toLowerCase();if(s&&s.includes('@'))out.add(s);};
  try{
    const j=JSON.parse(raw),arr=Array.isArray(j)?j:(Array.isArray(j?.exclusions)?j.exclusions:Array.isArray(j?.items)?j.items:[]);
    for(const x of arr){
      if(typeof x==='string'){add(x);continue;}
      if(!x||typeof x!=='object'||x.active===false||String(x.active).toLowerCase()==='false')continue;
      add(x.auditorEmail||x.email||x.auditor||x.userEmail);
    }
  }catch{raw.split(/[;,|\n]/).forEach(add);}
  return out;
}

export function v211ResolveAuditorEmail(audValues,identity){
  const requested=clean(identity).toLowerCase();
  if(!requested||!Array.isArray(audValues)||!audValues.length)return '';
  const h=audValues[0],e=col(h,['E-mail','Email','E-mail address','Mail']);
  if(e<0)return '';
  if(requested.includes('@'))return requested;
  const n=col(h,['Name','Auditor','Auditor name']);
  if(n<0)return '';
  const matches=audValues.slice(1).filter(row=>val(row,n).toLowerCase()===requested);
  return matches.length===1?val(matches[0],e).toLowerCase():'';
}

export function v211AuditorQualified(audValues,catalog,scopeCodes,auditorEmail){
  if(!Array.isArray(audValues)||!audValues.length)return false;
  const h=audValues[0],e=col(h,['E-mail','Email','E-mail address','Mail']),a=col(h,['Active','Is active']),r=col(h,['Role','Function']);
  const aliases=new Map();
  for(const s of catalog||[]){
    const canonical=key(s.scopeCode||s.displayName||s.slotKey);
    for(const x of [s.scopeCode,s.displayName,s.slotKey])if(x)aliases.set(key(x),canonical);
  }
  const email=clean(auditorEmail).toLowerCase();
  if(!email||!email.includes('@')||e<0)return false;
  const matches=audValues.slice(1).filter(row=>val(row,e).toLowerCase()===email);
  if(matches.length!==1)return false;
  const target=matches[0];
  if((a>=0&&!yes(target[a]))||(r>=0&&val(target,r).toLowerCase()!=='auditor'))return false;
  if(!target)return false;
  return (scopeCodes||[]).every(sc=>{
    const canon=aliases.get(key(sc))||key(sc);
    for(let i=0;i<h.length;i++){
      const headerCanon=aliases.get(key(h[i]))||key(h[i]);
      if(headerCanon===canon)return yes(target[i]);
    }
    return false;
  });
}

export function v211MinimumIntervalConstraint({logValues,catalog,scopeCodes,companyUid,companyName}={}){
  const out={minPlanningDate:'',byScope:[]};
  if(!Array.isArray(logValues)||logValues.length<2)return out;
  const wanted=(catalog||[]).filter(s=>Number(s.minIntervalMonths||0)>0&&(scopeCodes||[]).some(x=>[s.displayName,s.scopeCode,s.slotKey].some(y=>key(x)===key(y))));
  if(!wanted.length)return out;
  const h=logValues[0],cu=col(h,['Company_UID','Company UID','CompanyUid']),cc=col(h,['Company']),cs=col(h,['Status']),cd=col(h,['Date completed','Completed date','Date planned','Date - Planned','Audit date','Execution date','Date']),csl=col(h,['Scopes list','Scopes','Scope']);
  const uid=clean(companyUid),company=key(companyName);
  for(const def of wanted){
    const aliases=new Set([def.displayName,def.scopeCode,def.slotKey].map(key).filter(Boolean));let latest='';
    for(const row of logValues.slice(1)){
      const st=val(row,cs).toUpperCase().replace(/[\s-]+/g,'_');
      if(st&&st!=='COMPLETED'&&st!=='REALIZED')continue;
      const rowUid=val(row,cu),rowCompany=key(val(row,cc));
      if(uid){if(rowUid){if(rowUid!==uid)continue;}else if(!company||rowCompany!==company)continue;}else if(!company||rowCompany!==company)continue;
      let match=false;
      for(let i=0;i<h.length&&!match;i++)if(aliases.has(key(h[i]))&&yes(row[i]))match=true;
      if(!match&&csl>=0)match=val(row,csl).split(/[,;|]/).some(x=>aliases.has(key(x)));
      if(!match)continue;
      const d=dateOnly(row[cd]);if(d&&(!latest||d>latest))latest=d;
    }
    if(!latest)continue;
    const minDate=addMonthsIso(latest,Number(def.minIntervalMonths||0));if(!minDate)continue;
    out.byScope.push({scopeCode:def.scopeCode||def.displayName,minIntervalMonths:Number(def.minIntervalMonths||0),lastCompletedDate:latest,minPlanningDate:minDate});
    if(!out.minPlanningDate||minDate>out.minPlanningDate)out.minPlanningDate=minDate;
  }
  return out;
}

export function v211RotationHardCheck(rotationResult){
  if(!rotationResult||rotationResult.success===false)return{ok:false,reasons:['PLANNING_ROTATION_CHECK_FAILED']};
  const a=rotationResult.auditor||{};
  const reasons=[];
  if(a.hardBlockQualification||a.ineligible)reasons.push('AUDITOR_NOT_HARD_QUALIFIED');
  if(a.softBlockRotation)reasons.push('PLANNING_ROTATION_LIMIT_HARD_BLOCK');
  return{ok:reasons.length===0,reasons};
}

export function v211AssignmentHardCheck({
  auditorEmail,
  auditorValues,
  catalog,
  scopeCodes,
  companyValues,
  companyUid,
  companyName,
  logValues,
  requestedDates
}={}){
  const reasons=[];
  if(!v211AuditorQualified(auditorValues||[],catalog||[],scopeCodes||[],auditorEmail))reasons.push('AUDITOR_NOT_HARD_QUALIFIED');
  if(v211CompanyAuditorExclusions(companyValues||[],companyUid,companyName).has(clean(auditorEmail).toLowerCase()))reasons.push('AUDITOR_EXCLUDED_FOR_COMPANY');
  const minInterval=v211MinimumIntervalConstraint({logValues:logValues||[],catalog:catalog||[],scopeCodes:scopeCodes||[],companyUid,companyName});
  if(minInterval.minPlanningDate&&(requestedDates||[]).some(d=>dateOnly(d)<minInterval.minPlanningDate))reasons.push('MIN_INTERVAL_HARD_BLOCK_'+minInterval.minPlanningDate);
  return{ok:reasons.length===0,reasons,minInterval};
}
