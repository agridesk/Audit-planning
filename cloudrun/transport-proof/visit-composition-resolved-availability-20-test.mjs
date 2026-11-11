import assert from 'node:assert/strict';
import {verifyFreshResolvedCompositionAvailability20 as verify} from './visit-composition-resolved-availability-20.mjs';
const base=()=>({
 auditorId:'AUD-1',date:'2026-11-18',
 blocks:[{date:'2026-11-18',start:'12:00',end:'16:00'}],
 resolved:{
  auditorId:'AUD-1',canonicalFresh:true,version:7,unknownReservationOwner:false,
  uncertainAuditorIds:[],incompleteAuditDiagnostics:[],
  days:[{date:'2026-11-18',segments:[
   {start:'00:00',end:'12:00',state:'HARD'},
   {start:'12:00',end:'24:00',state:'FREE'}
  ]}]
 }
});
const ok=verify(base());
assert.equal(ok.verified,true);assert.equal(ok.writeEnabled,false);
assert.equal(ok.availabilityVersion,7);assert.equal(ok.softWarnings,0);
const negative=(mutate,code)=>{const x=base();mutate(x);
 assert.throws(()=>verify(x),e=>e?.code===code,code);
};
negative(x=>{x.blocks[0].start='11:59'},'COMPOSITION_RESOLVED_HARD_CONFLICT');
negative(x=>{x.resolved.days[0].segments[0].state='COMMITTED';x.blocks[0].start='11:59'},'COMPOSITION_RESOLVED_COMMITTED_CONFLICT');
negative(x=>{x.resolved.days[0].segments[0].state='PROVISIONAL';x.blocks[0].start='11:59'},'COMPOSITION_RESOLVED_PROVISIONAL_CONFLICT');
negative(x=>{x.resolved.canonicalFresh=false},'COMPOSITION_RESOLVED_FRESH_EVIDENCE_REQUIRED');
negative(x=>{x.resolved.incompleteAuditDiagnostics=[{auditId:'A-9'}]},'COMPOSITION_RESOLVED_CANONICAL_DIAGNOSTIC_UNCERTAIN');
negative(x=>{x.resolved.unknownReservationOwner=true},'COMPOSITION_RESOLVED_CANONICAL_DIAGNOSTIC_UNCERTAIN');
negative(x=>{x.resolved.days[0].segments[1].start='13:00'},'COMPOSITION_RESOLVED_SEGMENT_COVERAGE_INVALID');
negative(x=>{x.resolved.version=null},'COMPOSITION_RESOLVED_FRESH_EVIDENCE_REQUIRED');
negative(x=>{x.blocks[0].end='25:00'},'COMPOSITION_RESOLVED_INTERVAL_INVALID');
const soft=base();soft.resolved.days[0].segments[0].state='SOFT';
soft.blocks[0].start='11:00';
assert.equal(verify(soft).softWarnings,1);
const adjacent=base();adjacent.blocks[0].start='12:00';
assert.equal(verify(adjacent).verified,true);
console.log('VISIT_COMPOSITION_RESOLVED_AVAILABILITY_20_PASS: fresh provenance, HARD, COMMITTED, PROVISIONAL, SOFT, adjacent intervals');
