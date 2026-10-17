// Notifications 2.0 portal settings: pure allowlist and validation; no direct sheet mutation.
export const EDITABLE_NOTIFICATION_SETTINGS=Object.freeze({
 DEFAULT_FROM_NAME:{type:'text',max:120,label:'Sender name'},
 DEFAULT_REPLY_TO:{type:'email',label:'Reply-to address'},
 // DEV mail policy is owned by System_Config; legacy Notification_Settings
 // TEST_MODE / TEST_RECIPIENT must never be edited as independent controls.
 // Only sender presentation fields may be edited through this policy.
});
export function validateNotificationSettingsPatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('INVALID_SETTINGS_PATCH');
 const keys=Object.keys(patch);if(!keys.length||keys.length>2)throw Error('INVALID_SETTINGS_COUNT');
 const clean={};
 for(const key of keys){
  if(!Object.hasOwn(EDITABLE_NOTIFICATION_SETTINGS,key))throw Error('SETTING_NOT_EDITABLE:'+key);
  const spec=EDITABLE_NOTIFICATION_SETTINGS[key],v=patch[key];
  if(typeof v!=='string'||v.length>256)throw Error('INVALID_SETTING_VALUE:'+key);
  const value=v.trim();
  if(spec.type==='text'&&(!value||value.length>spec.max))throw Error('INVALID_TEXT:'+key);
  if(spec.type==='email'&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('INVALID_EMAIL:'+key);
  if(spec.type==='choice'&&!spec.values.includes(value))throw Error('INVALID_CHOICE:'+key);
  clean[key]=value;
 }
 return clean;
}
export function sanitizeNotificationSettingsForPortal(settings={}){
 const result={};for(const key of Object.keys(EDITABLE_NOTIFICATION_SETTINGS))result[key]=String(settings[key]??'');
 return result;
}
// MAIL_PROVIDER, API credentials, routing internals and production safety switches
// are intentionally excluded from portal edit access.
