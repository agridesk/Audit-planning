// Scope Management 2.0: server-side role check, fail closed.
function ScopeManagement20_authorizeManager_(email){
  var caller=String(email||'').trim().toLowerCase();
  if(!caller)return false;
  if(typeof V5_getCallerEmail_!=='function'||typeof V5_getUserRoleFromAuditors_!=='function')return false;
  var actual=String(V5_getCallerEmail_()||'').trim().toLowerCase();
  if(!actual||actual!==caller)return false;
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var role=V5_getUserRoleFromAuditors_(ss,caller);
  return !!(role&&role.found&&String(role.role||'').trim().toLowerCase()==='manager');
}
