// AMS #88: explicit DEV-only preparation, never activates email delivery.
function RUN_PREPARE_ECAS20_REJECTED_CONFIG_DEV_(){
 var props=PropertiesService.getScriptProperties();
 var env=String(props.getProperty('AMS_ENV')||props.getProperty('ENVIRONMENT')||'').trim().toUpperCase();
 if(env!=='DEV')throw Error('ECAS_CONFIG_PREPARE_DEV_ONLY');
 var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Notification_Config');
 if(!sh||sh.getLastRow()<2)throw Error('ECAS_CONFIG_SHEET_MISSING');
 var values=sh.getDataRange().getValues(),h=values[0].map(function(x){return String(x||'').trim().toUpperCase();});
 var c=function(k){var i=h.indexOf(k);if(i<0)throw Error('ECAS_CONFIG_COLUMN_MISSING_'+k);return i;};
 var k=c('EVENT_KEY'),active=c('ACTIVE'),send=c('SEND_EMAIL'),log=c('LOG_ONLY'),reason=c('REQUIRE_REASON'),comment=c('INCLUDE_COMMENT'),group=c('DIGEST_GROUP'),family=c('TEMPLATE_FAMILY'),template=c('TEMPLATE_KEY_DEFAULT');
 var target='ECAS_AUDIT_REJECTED_DIGEST',existing=values.slice(1).filter(function(r){return String(r[k]||'').trim()===target;});
 if(existing.length)return{ok:true,created:false,alreadyExists:true,active:String(existing[0][active]),sendEmail:String(existing[0][send])};
 var source=values.slice(1).filter(function(r){return String(r[k]||'').trim()==='ECAS_AUDIT_CANCELLED_DIGEST';});
 if(source.length!==1)throw Error('ECAS_CANCEL_TEMPLATE_NOT_UNIQUE');
 var row=source[0].slice();while(row.length<h.length)row.push('');
 row[k]=target;row[active]='NO';row[send]='NO';row[log]='YES';row[reason]='YES';row[comment]='YES';row[group]='ECAS_OPERATIONAL';row[family]='EXTERNAL_OPERATIONAL';row[template]=target;
 sh.appendRow(row);
 return{ok:true,created:true,active:'NO',sendEmail:'NO',requiresExplicitActivation:true};
}
