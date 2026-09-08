/**
 * FILE: zz_AMS01_LifecycleWriteBatchPerfOverride.js
 * BUILD: AMS01_LIFECYCLE_WRITE_BATCH_ZZ_20260908_R1
 *
 * DEV-only late-load optimization for the canonical lifecycle writer.
 * Only write mechanics change: adjacent metadata columns are written in one
 * setValues call. Lifecycle ownership, values and timing semantics stay intact.
 */
var AMS01_LIFECYCLE_WRITE_BATCH_ZZ_BUILD='AMS01_LIFECYCLE_WRITE_BATCH_ZZ_20260908_R1';

function lifecycle_writeUpdates_(sheet,rowIndex,updates,label){
  updates=updates||[];
  if(!sheet||!rowIndex) return {success:false,written:false,warning:'Missing sheet target for '+label};
  if(!updates.length) return {success:true,written:false,warning:'No matching columns for '+label};

  try{
    var sorted=updates.slice().sort(function(a,b){return Number(a.col||0)-Number(b.col||0);});
    var groups=[];
    var current=[];

    for(var i=0;i<sorted.length;i++){
      var u=sorted[i]||{};
      if(!current.length||Number(u.col)===Number(current[current.length-1].col)+1){
        current.push(u);
      }else{
        groups.push(current);
        current=[u];
      }
    }
    if(current.length) groups.push(current);

    for(var g=0;g<groups.length;g++){
      var grp=groups[g];
      var firstCol=Number(grp[0].col||0);
      if(grp.length===1){
        sheet.getRange(rowIndex,firstCol).setValue(grp[0].value);
      }else{
        sheet.getRange(rowIndex,firstCol,1,grp.length).setValues([
          grp.map(function(x){return x.value;})
        ]);
      }
    }

    return {
      success:true,
      written:true,
      count:updates.length,
      groups:groups.length,
      build:AMS01_LIFECYCLE_WRITE_BATCH_ZZ_BUILD
    };
  }catch(e){
    return {success:false,written:false,warning:'Write failed for '+label+': '+String(e&&e.message?e.message:e)};
  }
}

function AMS01_LifecycleWriteBatchPerfStatus(){
  return {success:true,active:true,build:AMS01_LIFECYCLE_WRITE_BATCH_ZZ_BUILD};
}
