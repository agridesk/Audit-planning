// Read-only migration inventory: existing Company_Scopes.Company_Formal_Hours_Override
// is the canonical source until a separately approved and reconciled cutover.
const trim=x=>String(x??'').trim();
const hdr=(rows,required)=>{const h=(rows[0]||[]).map(trim);for(const n of required)if(!h.includes(n))throw Error('MIGRATION_SOURCE_HEADER_MISSING_'+n);return n=>h.indexOf(n)};
export function previewCompanyHoursMigration20({companyScopes,configScopes,targetRows}){
 if(!Array.isArray(companyScopes)||!Array.isArray(configScopes)||!Array.isArray(targetRows))throw Error('MIGRATION_INPUT_UNAVAILABLE');
 const si=hdr(companyScopes,['Company_Scope_ID','Company_UID','ScopeCode','Active','Company_Formal_Hours_Override']);
 const ci=hdr(configScopes,['ScopeCode']);
 const known=new Set(configScopes.slice(1).map(r=>trim(r[ci('ScopeCode')])).filter(Boolean));
 const ti=targetRows.length?hdr(targetRows,['OverrideId','Company_UID','ScopeCode','Hours','Status','Revision','SupersedesOverrideId']):null;
 const seen=new Set(),errors=[],items=[];
 for(let i=1;i<companyScopes.length;i++){
  const r=companyScopes[i],value=trim(r[si('Company_Formal_Hours_Override')]);
  if(!value)continue;
  const id=trim(r[si('Company_Scope_ID')]),company=trim(r[si('Company_UID')]),scope=trim(r[si('ScopeCode')]);
  const numeric=value.replace(',','.');
  if(!id||!company||!scope||!known.has(scope)||seen.has(id)||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(numeric)||Number(numeric)<=0||Number(numeric)>10000){
   errors.push({row:i+1,reason:'INVALID_OR_DUPLICATE_LEGACY_OVERRIDE'});continue;
  }
  seen.add(id);
  const active=['YES','TRUE','1'].includes(trim(r[si('Active')]).toUpperCase());
  items.push({sourceCompanyScopeId:id,companyUid:company,scopeCode:scope,hours:Number(numeric),active});
 }
 const byRelation=new Map();
 for(const x of items){const key=x.companyUid+'\u0000'+x.scopeCode;if(byRelation.has(key))errors.push({reason:'DUPLICATE_COMPANY_SCOPE_RELATION',scopeCode:x.scopeCode});byRelation.set(key,x);}
 const alreadyMigrated=ti?targetRows.slice(1).filter(r=>trim(r[ti('SupersedesOverrideId')])&&seen.has(trim(r[ti('SupersedesOverrideId')]))).length:0;
 return{ok:errors.length===0,readOnly:true,sourceRows:companyScopes.length-1,sourceOverrides:items.length,activeOverrides:items.filter(x=>x.active).length,inactiveOverrides:items.filter(x=>!x.active).length,alreadyMigrated,errors,requiresCutover:true};
}
