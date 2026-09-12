/***********************************************************************
 * PlanningWorkspaceShellPerformanceDiagnostic.js
 * BUILD: 2026-09-12_WORKSPACE_SHELL_PERF_DIAGNOSTIC_R1
 *
 * Read-only diagnostic for the server-side HTML shell path.
 * No Spreadsheet reads/writes. No planning/service reads.
 ***********************************************************************/
var PLANNING_WORKSPACE_SHELL_PERF_DIAGNOSTIC_BUILD='2026-09-12_WORKSPACE_SHELL_PERF_DIAGNOSTIC_R1';

function PWSPD_measure_(label,fn){
  var t=Date.now(),v=fn(),ms=Date.now()-t;
  return{label:label,ms:ms,value:v};
}

function PWSPD_file_(name){
  var m=PWSPD_measure_(name,function(){return HtmlService.createHtmlOutputFromFile(name).getContent();});
  return{name:name,ms:m.ms,chars:String(m.value||'').length};
}

function PWSPD_template_(){
  var t0=Date.now();
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  var createMs=Date.now()-t0;
  t.__seedJson='{"ok":false,"meta":{"serverSeed":false,"dataIndependentShell":true}}';
  t.__seedFrom='';
  t.__seedTo='';
  var t1=Date.now(),html=t.evaluate().getContent(),evaluateMs=Date.now()-t1;
  return{createMs:createMs,evaluateMs:evaluateMs,totalMs:createMs+evaluateMs,chars:String(html||'').length};
}

function PWSPD_renderer_(){
  var t=Date.now(),out=PlanningWorkspaceUi_render({diagnostic:true}),ms=Date.now()-t;
  var content='';
  try{content=out&&typeof out.getContent==='function'?out.getContent():'';}catch(e){}
  return{ms:ms,chars:String(content||'').length};
}

function RUN_PLANNING_WORKSPACE_SHELL_PERFORMANCE_DIAGNOSTIC(){
  var files=[
    'PlanningWorkspaceDragDrop.js',
    'PlanningWorkspaceDetailToolkit.js',
    'PlanningWorkspaceContextEnhancer.js',
    'PlanningWorkspaceAttentionEnhancer.js',
    'PlanningWorkspacePointerDragFallback.js'
  ];
  var fileReads=[];
  for(var i=0;i<files.length;i++)fileReads.push(PWSPD_file_(files[i]));
  var templateRuns=[],rendererRuns=[];
  for(var r=0;r<3;r++)templateRuns.push(PWSPD_template_());
  for(var x=0;x<3;x++)rendererRuns.push(PWSPD_renderer_());
  function avg(a,k){var n=0;for(var i=0;i<a.length;i++)n+=Number(a[i]&&a[i][k]||0);return a.length?Math.round(n/a.length):0;}
  var out={
    ok:true,
    build:PLANNING_WORKSPACE_SHELL_PERF_DIAGNOSTIC_BUILD,
    fileReads:fileReads,
    templateRuns:templateRuns,
    rendererRuns:rendererRuns,
    summary:{
      fileReadTotalMs:fileReads.reduce(function(n,x){return n+Number(x.ms||0);},0),
      fileReadTotalChars:fileReads.reduce(function(n,x){return n+Number(x.chars||0);},0),
      templateAvgMs:avg(templateRuns,'totalMs'),
      rendererAvgMs:avg(rendererRuns,'ms'),
      rendererChars:rendererRuns.length?rendererRuns[rendererRuns.length-1].chars:0
    },
    meta:{nonDestructive:true,spreadsheetReads:false,spreadsheetWrites:false,planningReads:false,serviceReads:false}
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
