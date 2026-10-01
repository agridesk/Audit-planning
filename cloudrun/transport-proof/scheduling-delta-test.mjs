import assert from 'node:assert/strict';

function parseDelta(raw){
  const s=String(raw==null?'':raw).trim().replace(',','.');
  if(s==='')return 0;
  const n=Number(s);
  if(!Number.isFinite(n))throw new Error('INVALID_DELTA');
  return n;
}
function target(formal,rawDelta){
  const f=Number(formal),d=parseDelta(rawDelta);
  if(!Number.isFinite(f))throw new Error('INVALID_FORMAL');
  const t=f+d;
  if(t<0)throw new Error('NEGATIVE_TARGET');
  return Math.round(t*100)/100;
}

assert.equal(target(5,-1),4,'ABC-like -1 delta');
assert.equal(target(8,-1),7,'GAP-like -1 delta');
assert.equal(target(10,-1),9,'company-specific formal override remains base');
assert.equal(target(4,0),4,'zero delta');
assert.equal(target(4,''),4,'blank delta');
assert.equal(target(4,1),5,'positive delta');
assert.equal(target(4,'-0,5'),3.5,'decimal comma delta');
assert.throws(()=>target(4,'abc'),/INVALID_DELTA/,'invalid delta fails closed');
assert.throws(()=>target(0,-1),/NEGATIVE_TARGET/,'negative target fails closed');

console.log(JSON.stringify({
  success:true,
  build:'2026-10-01_SCHEDULING_DELTA_REGRESSION_R1',
  passed:9,
  writesPerformed:false
},null,2));
