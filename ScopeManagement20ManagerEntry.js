function ScopeManagement20_ManagerRead(request) {
  request=request||{};
  var actor=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!actor)return {success:false,errors:['MANAGER_IDENTITY_UNAVAILABLE'],readOnly:true};
  if(typeof m5t_isManagerAuthorized_!=='function')return {success:false,errors:['MANAGER_AUTH_NOT_CONFIGURED'],readOnly:true};
  if(m5t_isManagerAuthorized_(actor)!==true)return {success:false,errors:['MANAGER_ACCESS_DENIED'],readOnly:true};
  return ScopeManagement20_read_(SpreadsheetApp.getActiveSpreadsheet(),request);
}
