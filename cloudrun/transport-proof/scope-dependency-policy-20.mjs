/** Canonical Model C scope dependency evaluator.
 * Source: Config_Scope_Dependencies. Read-only policy; fail closed if missing,
 * truncated, malformed or contradictory. Never infer a dependency by name.
 */
const clean=v=>String(v??'').trim();
const canonical=v=>clean(v).toUpperCase().replace(/[\s_-]+/g,'');
const yes=v=>['YES','TRUE','1','X'].includes(canonical(v));
const no=v=>['NO','FALSE','0',''].includes(canonical(v));
export function requiredTogetherScopePairs20({dependencies,scopeCodes}={}){
 if(!Array.isArray(dependencies)||!Array.isArray(dependencies[0])||!dependencies[0].length)
  throw Error('SCOPE_DEPENDENCY_SOURCE_UNAVAILABLE');
 const h=dependencies[0].map(canonical);
 const names=['DEPENDENCY_ID','PARENT_SCOPECODE','CHILD_SCOPECODE','RELATIONSHIP_TYPE',
  'MUST_AUDIT_TOGETHER','SHARE_EXPIRY','ACTIVE'];
 const idx=names.map(n=>h.indexOf(canonical(n)));
 if(idx.some(n=>n<0)||new Set(idx).size!==idx.length)throw Error('SCOPE_DEPENDENCY_SCHEMA_INCOMPLETE');
 const codes=new Set((scopeCodes||[]).map(canonical).filter(Boolean));
 if(!codes.size||codes.size!==(scopeCodes||[]).length)throw Error('SCOPE_DEPENDENCY_SCOPE_SET_INVALID');
 const out=[],seen=new Set();
 for(const row of dependencies.slice(1)){
  if(!Array.isArray(row)||row.every(v=>!clean(v)))continue;
  const [id,parent,child,relation,must,shared,active]=idx.map(i=>clean(row[i]));
  if(!id||!parent||!child||!relation||(!yes(active)&&!no(active))||
     (!yes(must)&&!no(must))||(!yes(shared)&&!no(shared)))
   throw Error('SCOPE_DEPENDENCY_ROW_INVALID');
  if(!yes(active))continue;
  const p=canonical(parent),c=canonical(child);
  if(p===c||!p||!c||seen.has(id))throw Error('SCOPE_DEPENDENCY_ACTIVE_RULE_INVALID');
  seen.add(id);
  if(!yes(must)||!codes.has(p)||!codes.has(c))continue;
  out.push({dependencyId:id,parentScopeCode:parent,childScopeCode:child,
   relationshipType:relation,shareExpiry:yes(shared),mustAuditTogether:true});
 }
 return out;
}
export function assertScopeSplitAllowed20(options){
 const rules=requiredTogetherScopePairs20(options);
 if(rules.length)throw Error('COMPOSITION_SPLIT_MUST_AUDIT_TOGETHER:'+rules.map(r=>r.parentScopeCode+'+'+r.childScopeCode).join(','));
 return true;
}
