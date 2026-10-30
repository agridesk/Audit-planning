// Read-only, fail-closed migration preview for Auditors physical scope columns.
// No sheet writes; emits stable UID/ScopeCode relation rows and unresolved diagnostics.
const clean=v=>String(v??'').trim();
const key=v=>clean(v).toLowerCase();
const yes=v=>['x','yes','true','1'].includes(key(v));
export function previewAuditorQualificationMigration20({auditors,catalog}={}){
 if(!Array.isArray(auditors)||auditors.length<1||!Array.isArray(catalog)||catalog.length<1)throw Error('QUALIFICATION_MIGRATION_INPUT_MISSING');
 const ah=auditors[0],ch=catalog[0],col=(h,n)=>h.findIndex(x=>key(x)===key(n));
 const uid=col(ah,'Auditor_UID'),mail=col(ah,'E-mail'),code=col(ch,'ScopeCode'),slot=col(ch,'SlotKey'),name=col(ch,'DisplayName');
 if([uid,mail,code,slot,name].some(i=>i<0))throw Error('QUALIFICATION_MIGRATION_SCHEMA_MISSING');
 const errors=[],scopes=[],seenCodes=new Set(),seenSlots=new Set(),seenColumns=new Map(),seenUids=new Set(),seenEmails=new Set();
 for(let i=1;i<catalog.length;i++){
  const r=catalog[i],c=clean(r[code]),s=clean(r[slot]),n=clean(r[name]);
  if(!c||!n||!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(s)||seenCodes.has(key(c))||seenSlots.has(key(s)))errors.push('INVALID_CATALOG_ROW_'+(i+1));
  seenCodes.add(key(c));seenSlots.add(key(s));
  const matched=[c,n,s].map(alias=>col(ah,alias)).filter(x=>x>=0);
  if(new Set(matched).size>1)errors.push('AMBIGUOUS_SCOPE_COLUMNS_'+s);
  const column=matched.length?matched[0]:-1;
  if(column>=0){if(seenColumns.has(column))errors.push('SHARED_QUALIFICATION_COLUMN_'+s);else seenColumns.set(column,s);}
  scopes.push({code:c,slot:s,column});
 }
 if(scopes.length>20)errors.push('SCOPE_CAPACITY_EXCEEDED');
 const rows=[];
 for(let i=1;i<auditors.length;i++){
  const r=auditors[i];if(r.every(x=>!clean(x)))continue;
  const id=clean(r[uid]),email=key(r[mail]);
  if(!id||!email||seenUids.has(id)||seenEmails.has(email))errors.push('INVALID_AUDITOR_IDENTITY_ROW_'+(i+1));
  seenUids.add(id);seenEmails.add(email);
  for(const scope of scopes){
   if(scope.column<0)continue;
   const value=key(r[scope.column]);
   if(value&&!['x','yes','true','1','no','false','0'].includes(value))errors.push('INVALID_QUALIFICATION_VALUE_ROW_'+(i+1)+'_'+scope.slot);
   if(yes(value))rows.push({Auditor_UID:id,ScopeCode:scope.code,Qualified:'YES'});
  }
 }
 const unrepresentedScopes=scopes.filter(s=>s.column<0).map(s=>s.slot);
 // Newly configured scopes have no historical column by design. Only the
 // original eight legacy slots require a migration source column.
 const missingLegacyScopes=unrepresentedScopes.filter(s=>Number(s.slice(6))<=8);
 return {ok:errors.length===0&&missingLegacyScopes.length===0,readOnly:true,writesPerformed:false,rows,qualifiedCount:rows.length,errors,unrepresentedScopes,missingLegacyScopes,scopeCount:scopes.length,auditorCount:seenUids.size};
}
