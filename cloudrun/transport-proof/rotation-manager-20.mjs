const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[\s_-]+/g,'');
const index=(h,...names)=>names.map(n=>h.findIndex(x=>norm(x)===norm(n))).find(i=>i>=0)??-1;
const truth=v=>['true','yes','1','x'].includes(clean(v).toLowerCase());
export function buildRotationManager20(scopes,auditors,log){
 const sh=scopes[0]||[],lh=log[0]||[],ah=auditors[0]||[];
 const slot=index(sh,'SlotKey'),code=index(sh,'ScopeCode'),name=index(sh,'DisplayName'),active=index(sh,'Active'),archived=index(sh,'Archived'),applies=index(sh,'Rotation_Applies'),max=index(sh,'Rotation_Normal_Maximum');
 const li={company:index(lh,'Company'),companyUid:index(lh,'Company_UID'),auditor:index(lh,'Auditor'),auditorUid:index(lh,'Auditor_UID'),status:index(lh,'Status'),year:index(lh,'Year'),completed:index(lh,'Date completed')};
 const ai={email:index(ah,'E-mail','Email'),uid:index(ah,'Auditor_UID'),name:index(ah,'Name')};
 if([slot,code,name,active,archived,applies,max,li.company,li.companyUid,li.auditorUid,li.status,li.year,ai.email,ai.uid].some(x=>x<0))throw Error('ROTATION_MANAGER_SCHEMA_INCOMPLETE');
 const configured=new Map(),columns=new Map();
 for(const r of scopes.slice(1)){const s=clean(r[slot]);if(!s)continue;if(!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(s)||configured.has(s))throw Error('ROTATION_MANAGER_SCOPE_INVALID');const enabled=truth(r[active])&&!truth(r[archived]);const applicable=truth(r[applies]);const n=Number(r[max]);if(enabled&&applicable&&(!Number.isSafeInteger(n)||n<1))throw Error('ROTATION_MANAGER_POLICY_INVALID');configured.set(s,{slot:s,scope:clean(r[name]),code:clean(r[code]),maximum:enabled&&applicable?n:null,active:enabled});}
 for(const [s,v] of configured){const i=index(lh,s);if(i>=0)columns.set(s,i);}
 const people=new Map();for(const r of auditors.slice(1)){const uid=clean(r[ai.uid]);if(uid)people.set(uid,{name:clean(r[ai.name])||clean(r[ai.email]),email:clean(r[ai.email])});}
 const groups=new Map(),issues=[];const currentYear=new Date().getUTCFullYear();
 for(let rowNumber=1;rowNumber<log.length;rowNumber++){
  const r=log[rowNumber];if(!/^(completed|realized)$/i.test(clean(r[li.status])))continue;
  const companyUid=clean(r[li.companyUid]),auditorUid=clean(r[li.auditorUid]),company=clean(r[li.company]),year=Number(r[li.year]);
  const completed=li.completed>=0?clean(r[li.completed]):'';
  if(/^TEST_/i.test(company))continue;
  if(!companyUid||!auditorUid||!Number.isInteger(year)||year<2000||year>currentYear){issues.push({row:rowNumber+1,reason:'INVALID_YEAR_OR_IDENTITY',company,year:clean(r[li.year])});continue;}
  if(/^\d{4}-\d{2}-\d{2}/.test(completed)&&Number(completed.slice(0,4))!==year){issues.push({row:rowNumber+1,reason:'COMPLETION_YEAR_MISMATCH',company,year});continue;}
  for(const [s,i] of columns){const cfg=configured.get(s);if(!cfg.active||cfg.maximum===null||!truth(r[i]))continue;
   const key=companyUid+'|'+s;if(!groups.has(key))groups.set(key,{companyUid,company,scope:cfg.scope,slot:s,maximum:cfg.maximum,years:new Map(),events:[]});
   const g=groups.get(key);g.events.push({year,date:completed||String(year),auditorUid,row:rowNumber+1});if(!g.years.has(year))g.years.set(year,new Set());g.years.get(year).add(auditorUid);
  }
 }
 const rows=[];
 for(const g of groups.values()){
  const years=[...g.years.keys()].sort((a,b)=>b-a);
  g.events.sort((a,b)=>b.date.localeCompare(a.date)||b.row-a.row);
  const latestYear=years[0],latestOwners=new Set([g.events[0].auditorUid]);
  for(const uid of latestOwners){
   let count=0;
   const countedYears=new Set();
   for(const event of g.events){if(event.auditorUid!==uid)break;if(!countedYears.has(event.year)){count++;countedYears.add(event.year);}}
   const person=people.get(uid)||{name:uid,email:''};
   const status=count>=g.maximum?'AT_LIMIT':count===g.maximum-1?'NEAR_LIMIT':'AVAILABLE';
   rows.push({company:g.company,companyUid:g.companyUid,scope:g.scope,slot:g.slot,auditor:person.name,auditorUid:uid,years:years.join(', '),consecutiveYears:count,maximum:g.maximum,status,latestYear,lastCompleted:g.events[0].date,history:g.events.map(e=>({date:e.date,year:e.year,auditor:(people.get(e.auditorUid)||{}).name||e.auditorUid,auditorUid:e.auditorUid}))});
  }
 }
 rows.sort((a,b)=>({REVIEW_REQUIRED:0,AT_LIMIT:1,NEAR_LIMIT:2,AVAILABLE:3}[a.status]-{REVIEW_REQUIRED:0,AT_LIMIT:1,NEAR_LIMIT:2,AVAILABLE:3}[b.status])||a.company.localeCompare(b.company));
 return {success:true,rows,scopeCount:configured.size,realizedRows:log.length-1,issues,historyPolicy:'ALL_AVAILABLE_YEARS_GAPS_DO_NOT_BREAK'};
}
