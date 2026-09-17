/***********************************************************************
 * FILE: ManagerToAuditorPlanningMailContractTests.js
 * BUILD: 2026-09-17_MANAGER_TO_AUDITOR_MAIL_CONTRACT_TESTS_R2
 *
 * Non-destructive runtime contract regression.
 * Tests the loaded GAS functions directly; no source-file reads.
 ***********************************************************************/
var MTAP_MAIL_TEST_BUILD='2026-09-17_MANAGER_TO_AUDITOR_MAIL_CONTRACT_TESTS_R2';

function RUN_MANAGER_TO_AUDITOR_PLANNING_MAIL_CONTRACT_REGRESSION(){
  var r=[];
  function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  function fn_(name){try{return typeof this[name]==='function';}catch(e){return false;}}

  t('richOperationalOwner',typeof NB_renderRichOperational_==='function');
  t('richOperationalHtmlOwner',typeof NB_renderRichOperationalHtml_==='function');
  t('planningTableOwner',typeof NB_managerToAuditorPlanningTableHtml_==='function');
  t('calendarLinksOwner',typeof NB_managerToAuditorCalendarLinksHtml_==='function');
  t('googleCalendarOwner',typeof NB_managerToAuditorGoogleCalendarUrl_==='function');
  t('appleCalendarOwner',typeof NB_managerToAuditorAppleCalendarDataUrl_==='function');
  t('calendarDescriptionOwner',typeof NB_managerToAuditorCalendarDescriptionLines_==='function');

  var n={
    auditId:'AUD_TEST_CONTRACT',
    company:'Contract Test Company',
    mpsNumber:'MPS-TEST',
    scopes:['ABC'],
    contactName:'Test Contact',
    contactEmail:'test@example.invalid',
    contactPhone:'+31 00 0000000',
    blocks:[{
      date:'2026-09-30',start:'09:00',end:'12:00',hours:3,
      execLoc:'Test location',gps:'51.653,5.287',slotComment:'Contract test'
    }]
  };

  var html='';
  try{html=NB_renderRichOperationalHtml_(n)||'';}catch(e){t('renderHtmlWithoutError',false,e&&e.message);html='';}
  if(html)t('renderHtmlWithoutError',true);
  t('contactNameRendered',html.indexOf('Test Contact')>=0);
  t('contactTelephoneRendered',html.indexOf('+31 00 0000000')>=0);
  t('contactEmailRendered',html.indexOf('test@example.invalid')>=0);
  t('gpsRendered',html.indexOf('51.653,5.287')>=0);
  t('calendarLinksRendered',html.indexOf('calendar')>=0||html.indexOf('Calendar')>=0||html.indexOf('data:text/calendar')>=0);

  var desc=[];
  try{desc=NB_managerToAuditorCalendarDescriptionLines_(n,n.blocks[0])||[];}catch(e){t('calendarDescriptionWithoutError',false,e&&e.message);desc=[];}
  if(desc.length)t('calendarDescriptionWithoutError',true);
  var descText=desc.join('\n');
  t('calendarDescriptionHasContactDetails',descText.indexOf('Contact details:')>=0);
  t('calendarDescriptionHasMapsUrl',descText.indexOf('Google Maps:')>=0);

  var google='';
  try{google=NB_managerToAuditorGoogleCalendarUrl_(n,n.blocks[0])||'';}catch(e){t('googleCalendarWithoutError',false,e&&e.message);}
  if(google)t('googleCalendarWithoutError',true);
  t('googleCalendarUrl',google.indexOf('calendar.google.com/calendar/render')>=0);

  var apple='';
  try{apple=NB_managerToAuditorAppleCalendarDataUrl_(n,n.blocks[0],0)||'';}catch(e){t('appleCalendarWithoutError',false,e&&e.message);}
  if(apple)t('appleCalendarWithoutError',true);
  t('appleCalendarDataUrl',apple.indexOf('data:text/calendar')===0);
  var decoded='';
  try{decoded=decodeURIComponent(apple.substring(apple.indexOf(',')+1));}catch(e){}
  t('icsCalendarPayload',decoded.indexOf('BEGIN:VCALENDAR')>=0&&decoded.indexOf('BEGIN:VEVENT')>=0);
  t('oneDayReminder',decoded.indexOf('TRIGGER:-P1D')>=0);

  var failed=r.filter(function(x){return!x.ok}).length;
  var out={
    ok:failed===0,
    build:MTAP_MAIL_TEST_BUILD,
    total:r.length,
    passed:r.length-failed,
    failed:failed,
    results:r,
    meta:{
      nonDestructive:true,
      liveReads:false,
      liveWrites:false,
      sourceFileReads:false,
      contract:'Manager→Auditor planning mail includes contact details, GPS/Maps, Google calendar and Apple/ICS with 1-day reminder',
      rendererOwner:'NotificationRenderer_ManagerToAuditorPlanning.js'
    }
  };
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
