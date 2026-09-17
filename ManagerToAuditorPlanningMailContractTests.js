/***********************************************************************
 * FILE: ManagerToAuditorPlanningMailContractTests.js
 * BUILD: 2026-09-17_MANAGER_TO_AUDITOR_MAIL_CONTRACT_TESTS_R1
 ***********************************************************************/
var MTAP_MAIL_TEST_BUILD='2026-09-17_MANAGER_TO_AUDITOR_MAIL_CONTRACT_TESTS_R1';
function RUN_MANAGER_TO_AUDITOR_PLANNING_MAIL_CONTRACT_REGRESSION(){
  var src=HtmlService.createHtmlOutputFromFile('NotificationRenderer_ManagerToAuditorPlanning.js').getContent(),r=[];
  function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  t('richOperationalOwner',src.indexOf('function NB_renderRichOperational_')>=0);
  t('contactNameRendered',src.indexOf("'Contact name'")>=0);
  t('contactTelephoneRendered',src.indexOf("'Contact telephone'")>=0);
  t('contactEmailRendered',src.indexOf("'Contact e-mail'")>=0);
  t('gpsColumnRendered',src.indexOf("NB_thSoft_('GPS')")>=0);
  t('gpsGoogleMapsLink',src.indexOf('NB_googleMapsUrl_(b.gps)')>=0);
  t('googleCalendarLink',src.indexOf('NB_managerToAuditorGoogleCalendarUrl_')>=0);
  t('appleCalendarLink',src.indexOf('NB_managerToAuditorAppleCalendarDataUrl_')>=0);
  t('icsCalendarPayload',src.indexOf("'BEGIN:VCALENDAR'")>=0&&src.indexOf("'BEGIN:VEVENT'")>=0);
  t('oneDayReminder',src.indexOf("'TRIGGER:-P1D'")>=0);
  t('calendarDescriptionHasContactDetails',src.indexOf("desc.push('Contact details:')")>=0);
  t('calendarDescriptionHasMapsUrl',src.indexOf("desc.push('Google Maps: ' + mapsUrl)")>=0);
  t('noQueueWrites',src.indexOf('NotificationQueue')<0&&src.indexOf('appendRow')<0);
  t('noStatusWrites',src.indexOf('setValue')<0&&src.indexOf('setValues')<0);
  var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:MTAP_MAIL_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReads:false,liveWrites:false,contract:'Manager→Auditor planning mail includes contact details, GPS/Maps, Google calendar and Apple/ICS with 1-day reminder',rendererOwner:'NotificationRenderer_ManagerToAuditorPlanning.js'}};Logger.log(JSON.stringify(out,null,2));return out;
}
