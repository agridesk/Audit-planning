/**
 * FILE: zz_AMS01_AuditorAvailabilityFirstLoadPerfOverride.js
 * BUILD: AMS01_AUDITOR_AVAIL_FIRST_LOAD_ZZ_20260909_R1_VISIBLE_MONTH_ONLY
 *
 * DEV-only tactical AMS-01 correction.
 *
 * RCA:
 * EntryV5 currently bootstraps previous/current/next Availability month
 * synchronously before AuditorAvailabilityV5 HTML is returned. That means the
 * user waits for THREE canonical AV_getAvailabilityMonthJSON_ calls before the
 * page can paint, although only the visible month is required for first use.
 *
 * R1:
 * - bootstrap only the visible/current month during first load;
 * - preserve the existing bootstrap payload contract (primaryMonthKey/months);
 * - preserve canonical AV_getAvailabilityMonthJSON_ as read owner;
 * - preserve all auth/runtime/template contracts;
 * - non-DEV and all other routes delegate untouched to canonical EntryV5.
 */
var AMS01_AUDITOR_AVAIL_FIRST_LOAD_ZZ_BUILD='AMS01_AUDITOR_AVAIL_FIRST_LOAD_ZZ_20260909_R1_VISIBLE_MONTH_ONLY';
var AMS01_V5_ENTRY_renderApp_CANONICAL_=V5_ENTRY_renderApp;

V5_ENTRY_renderApp=function(action,ctx){
  var runtimeEnv=V5_ENTRY_captureEnv_(ctx||{});
  if(runtimeEnv!=='DEV'||V5_ENTRY_normAction_(action)!=='auditoravailability'){
    return AMS01_V5_ENTRY_renderApp_CANONICAL_.apply(this,arguments);
  }

  ctx=ctx||{};
  var execUrl=V5_ENTRY_appendEnvToUrl_((function(){try{return ScriptApp.getService().getUrl();}catch(e0){return '';}})(),runtimeEnv);
  var email=String(ctx.email||'').trim().toLowerCase();
  var role=V5_ENTRY_expectedRole_('auditoravailability',ctx.role);
  var token=String(ctx.trustedToken||ctx.token||'').trim();
  var device=String(ctx.deviceFingerprint||ctx.deviceId||'').trim();

  var t3=HtmlService.createTemplateFromFile('AuditorAvailabilityV5');
  var avMonthKey=String(ctx.monthKey||'').trim()||V5_ENTRY_monthKeyNow_();
  var avBootstrapPayload={primaryMonthKey:avMonthKey,months:{}};
  var t0=Date.now();
  var monthMs=0;
  try{
    var mt0=Date.now();
    var monthPayload=AV_getAvailabilityMonthJSON_(email,avMonthKey,false);
    monthMs=Date.now()-mt0;
    if(monthPayload&&typeof monthPayload==='object'){
      avBootstrapPayload.months[avMonthKey]={
        success:monthPayload.success===true,
        monthKey:String(monthPayload.monthKey||avMonthKey),
        days:monthPayload.days||{},
        blockedWeekdaysCsv:String(monthPayload.blockedWeekdaysCsv||'')
      };
    }
  }catch(eMonthBoot){
    try{Logger.log('[AMS01_AV_FIRST_LOAD_WARN] '+String(eMonthBoot&&eMonthBoot.message?eMonthBoot.message:eMonthBoot));}catch(eLog){}
  }

  t3.AV5_EXEC_URL=execUrl;
  t3.AV5_AUDITOR_EMAIL=email;
  t3.AV5_MONTHKEY=avMonthKey;
  t3.AV5_BOOTSTRAP_JSON=JSON.stringify(avBootstrapPayload);
  t3.AV5_BUILD_TS=AMS01_AUDITOR_AVAIL_FIRST_LOAD_ZZ_BUILD;
  t3.__UI_MODE='AVAILABILITY_ONLY';
  t3.__PAGE='myavailability';
  t3.__auditorEmail=email;
  t3.__token=token;
  t3.__execUrl=execUrl;
  t3.__email=email;
  t3.__role=role;
  t3.__trustedToken=token;
  t3.__deviceFingerprint=device;
  t3.__action='auditoravailability';
  t3.__env=runtimeEnv;

  try{Logger.log('[AMS01_AV_FIRST_LOAD] '+JSON.stringify({build:AMS01_AUDITOR_AVAIL_FIRST_LOAD_ZZ_BUILD,email:email,monthKey:avMonthKey,monthsBootstrapped:1,monthMs:monthMs,totalPreTemplateMs:Date.now()-t0}));}catch(eDiag){}
  return t3.evaluate().getContent();
};

function AMS01_AuditorAvailabilityFirstLoadPerfStatus(){
  return {success:true,active:V5_ENTRY_isDevEnv_(),build:AMS01_AUDITOR_AVAIL_FIRST_LOAD_ZZ_BUILD,bootstrapMonths:1};
}
