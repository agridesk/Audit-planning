/**
 * Read-only GAS preflight. Never use this function as write authorization.
 */
function Swap20CanonicalCommitGuard(input) {
  input = input || {};
  var a = String(input.auditA || '').trim();
  var b = String(input.auditB || '').trim();
  if (!a || !b || a === b) throw new Error('Distinct audit IDs required');
  var expected = input.expectedRevisions || {};
  if (!expected[a] || !expected[b]) throw new Error('Expected revisions required');
  var perfStart=Date.now();
  var pair = input.canonicalPair || Swap20_readCanonicalPair({auditA:a,auditB:b});
  if(input.canonicalPair && (String(pair.auditA&&pair.auditA.auditId)!==a || String(pair.auditB&&pair.auditB.auditId)!==b))throw Error('Canonical pair identity mismatch');
  if (!pair.eligible) throw new Error('Swap pair not eligible');
  if (String(pair.auditA.revision) !== String(expected[a]) ||
      String(pair.auditB.revision) !== String(expected[b])) throw new Error('Stale canonical revision');
  function mins(clock) {
    var m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(String(clock || ''));
    if (!m) throw new Error('Invalid time');
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function validate(source, target) {
    if (!Array.isArray(target) || source.length !== target.length || !target.length) throw new Error('Block count mismatch');
    var total = 0;
    for (var i = 0; i < source.length; i++) {
      var oldBlock = source[i], newBlock = target[i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(newBlock.date || ''))) throw new Error('Invalid date');
      var d=new Date(String(newBlock.date)+'T12:00:00Z');
      if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==String(newBlock.date))throw Error('Invalid calendar date');
      var before = mins(oldBlock.end) - mins(oldBlock.start);
      var after = mins(newBlock.end) - mins(newBlock.start);
      if (before <= 0 || before !== after) throw new Error('Duration mismatch');
      total += after;
    }
    return total;
  }
  function checkNoInternalOverlap(blocks){
   for(var i=0;i<blocks.length;i++)for(var j=i+1;j<blocks.length;j++){
    if(blocks[i].date===blocks[j].date&&mins(blocks[i].start)<mins(blocks[j].end)&&mins(blocks[j].start)<mins(blocks[i].end))throw Error('Overlapping final audit blocks');
   }
  }
  checkNoInternalOverlap(input.blocksA||[]);
  checkNoInternalOverlap(input.blocksB||[]);
  var minutesA = validate(pair.auditA.blocks,input.blocksA);
  var minutesB = validate(pair.auditB.blocks,input.blocksB);
  if(String(pair.auditA.assignedTo||'').toLowerCase()===String(pair.auditB.assignedTo||'').toLowerCase()){
   input.blocksA.forEach(function(x){input.blocksB.forEach(function(y){if(Swap20_overlap_(x,y))throw Error('Cross-audit overlap');});});
  }
  if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_PERF] '+JSON.stringify({step:'canonicalGuard',ms:Date.now()-perfStart,reusedPair:!!input.canonicalPair}));
  return {ok:true,readOnly:true,commitAuthorized:false,requiresPairLock:true,requiresDurableJournal:true,auditIds:[a,b],minutesA:minutesA,minutesB:minutesB};
}
