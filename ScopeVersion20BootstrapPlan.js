// Scope Management 2.0 — controlled version bootstrap proposal.
// Produces a deterministic dry-run. Never fabricates version labels or writes.
function ScopeVersion20_bootstrapPlan_(ss,versionIdsByScope){
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();versionIdsByScope=versionIdsByScope||{};
  var current=ScopeVersion20_read_(ss);
  if(!current.success)return {success:false,readOnly:true,errors:current.errors};
  if(current.initialized&&current.rows.length)return {success:false,readOnly:true,errors:['Version records already exist; bootstrap refused']};
  var catalog=ScopeManagement20_readRows_(ss.getSheetByName('Config_Scopes'));
  if(!catalog.success)return {success:false,readOnly:true,errors:catalog.errors};
  var errors=[],plan=[],seen={};
  catalog.rows.forEach(function(scope){
    var code=String(scope.scopeCode||'').trim(),version=String(versionIdsByScope[code]||'').trim();
    if(!code||!version){errors.push('Explicit legacy VersionId required: '+code);return;}
    if(seen[code]){errors.push('Duplicate scope: '+code);return;}
    seen[code]=true;
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(version)){errors.push('Invalid version identifier: '+code);return;}
    var raw=scope.hoursToPlan;
    if(raw===null||raw===undefined||String(raw).trim()===''){errors.push('Missing hours: '+code);return;}
    var hours=Number(String(raw).replace(',','.'));
    if(!isFinite(hours)||hours<0){errors.push('Invalid hours: '+code);return;}
    plan.push({ScopeCode:code,VersionId:version,Hours_to_plan:hours,Status:'CURRENT',
      Effective_From:'',Effective_To:'',Created_At:'',Created_By:'',Change_Reason:'Controlled legacy bootstrap'});
  });
  if(!errors.length){var validation=ScopeVersion20_validateRows_(plan);errors=validation.errors;}
  return {success:errors.length===0,readOnly:true,writesPerformed:false,
    requiresManagerApproval:true,requiresExplicitVersionIds:true,scopeCount:catalog.rows.length,
    proposedVersionCount:plan.length,errors:errors,proposedRows:errors.length?[]:plan};
}
