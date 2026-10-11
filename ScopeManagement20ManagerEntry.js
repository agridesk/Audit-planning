function ScopeManagement20_ManagerRead(request) {
  request=request||{};
  var actor=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!actor)return {success:false,errors:['MANAGER_IDENTITY_UNAVAILABLE'],readOnly:true};
  if(typeof ScopeManagement20_authorizeManager_!=='function')return {success:false,errors:['MANAGER_AUTH_NOT_CONFIGURED'],readOnly:true};
  if(ScopeManagement20_authorizeManager_(actor)!==true)return {success:false,errors:['MANAGER_ACCESS_DENIED'],readOnly:true};
  return ScopeManagement20_read_(SpreadsheetApp.getActiveSpreadsheet(),request);
}
