const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[\\s_-]+/g,'');
const index=(h,...names)=>names.map(n=>h.findIndex(x=>norm(x)===norm(n))).find(i=>i>=0)??-1;
const truth=v=>['true','yes','1','x'].includes(clean(v).toLowerCase());
export function buildRotationManager20(scopes,auditors,log){
 const sh=scopes[0]||[],lh=log[0]||[],ah=auditors[0]||[];
 const slot=index(sh,'SlotKey'),code=index(sh,'ScopeCode'),name=index(sh,'DisplayName'),active=index(sh,'Active'),archived=index(sh,'Archived'),applies=index(sh,'Rotation_Applies'),max=index(sh,'Rotation_Normal_Maximum');
 const li={company:index(lh,'Company'),companyUid:index(lh,'Company_UID'),auditor:index(lh,'Auditor'),auditorUid:index(lh,'Auditor_UID'),status:index(lh,'Status'),year:index(lh,'Year')};
 const ai={email:index(ah,'E-mail','Email'),uid:index(ah,'Auditor_UID'),name:index(ah,'Name')};
 if([slot,code,name,active,archived,applies,max,li.company,li.companyUid,li.auditorUid,li.status,li.year,ai.email,ai.uid].some(x=>x<0))throw Error('ROTATION_MANAGER_SCHEMA_INCOMPLETE');
 const configured=new Map(),columns=new Map();
 for(const r of scopes.slice(1)){const s=clean(r[slot]);if(!s)continue;if(!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(s)||configured.has(s))throw Error('ROTATION_MANAGER_SCOPE_INVALID');const enabled=truth(r[active])&&!truth(r[archived]);const applicable=truth(r[applies]);const n=Number(r[max]);if(enabled&&applicable&&(!Number.isSafeInteger(n)||n<1))throw Error('ROTATION_MANAGER_POLICY_INVALID');configured.set(s,{slot:s,scope:clean(r[name]),code:clean(r[code]),maximum:enabled&&applicable?n:null,active:enabled});}
 for(const [s,v] of configured){const i=index(lh,s);if(i>=0)columns.set(s,i);}
 const people=new Map();for(const r of auditors.slice(1)){const uid=clean(r[ai.uid]);if(uid)people.set(uid,{name:clean(r[ai.name])||clean(r[ai.email]),email:clean(r[ai.email])});}
 const groups=new Map();for(const r of log.slice(1)){if(!/complete|realized/i.test(clean(r[li.status])))continue;const companyUid=clean(r[li.companyUid]),auditorUid=clean(r[li.auditorUid]),company=clean(r[li.company]),year=Number(r[li.year]);if(!companyUid||!auditorUid||!Number.isInteger(year)||year<2000||year>2100)continue;for(const [s,i] of columns){const cfg=configured.get(s);if(!cfg.active||cfg.maximum===null||!truth(r[i]))continue;const key=companyUid+'|'+s;if(!groups.has(key))groups.set(key,{companyUid,company,scope:cfg.scope,slot:s,maximum:cfg.maximum,years:new Map()});const g=groups.get(key);if(!g.years.has(year))g.years.set(year,new Set());g.years.get(year).add(auditorUid);}}
 const rows=[];for(const g of groups.values()){const years=[...g.years.keys()].sort((a,b)=>b-a);const seen=new Set();for(const set of g.years.values())for(const uid of set)seen.add(uid);for(const uid of seen){let count=0;for(const y of years){const owners=g.years.get(y);if(!owners.has(uid))break;count++;if(owners.size>1)break;}const person=people.get(uid)||{name:uid,email:''};rows.push({company:g.company,companyUid:g.companyUid,scope:g.scope,slot:g.slot,auditor:person.name,auditorUid:uid,years:years.filter(y=>g.years.get(y).has(uid)).join(', '),consecutiveYears:count,maximum:g.maximum,status:count>=g.maximum?'AT_LIMIT':count===g.maximum-1?'NEAR_LIMIT':'AVAILABLE'});}}
 rows.sort((a,b)=>({AT_LIMIT:0,NEAR_LIMIT:1,AVAILABLE:2}[a.status]-{AT_LIMIT:0,NEAR_LIMIT:1,AVAILABLE:2}[b.status])||a.company.localeCompare(b.company));
 return {success:true,rows,scopeCount:configured.size,realizedRows:log.length-1};
}
