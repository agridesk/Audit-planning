import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const start=source.indexOf('async function verifyScopeAuditor20(){');
const end=source.indexOf('function switchScopeDraft20(',start);
assert.ok(start>0&&end>start,'scope qualification fetch must exist');
const state={payload:null,fetches:0,alerts:[]};
const auditor={value:'a@example.com'};
const ctx={
 auditId:'audit-1',
 q:id=>{assert.equal(id,'#auditor');return auditor},
 composition20:{
  mode:'TOGETHER',selectedScope:'gap',sourceRevision:'abcdef',
  scopes:[{obligationId:'gap',scopeCode:'GAP'},{obligationId:'grasp',scopeCode:'GRASP'}],
  auditorIds:new Map([['a@example.com','uid-1']])
 },
 encodeURIComponent,validate:()=>{},
 setStatus:text=>state.alerts.push(text),
 fetch:async url=>{
  state.fetches++;
  assert.ok(url.includes('auditorUid=uid-1'));
  return {ok:true,json:async()=>state.payload};
 }
};
runInNewContext(source.slice(start,end)+';this.check=verifyScopeAuditor20;',ctx);
const qualification={checked:true,active:true,role:'AUDITOR',
 qualifiedForAllScopes:false,missingScopeCodes:['GRASP']};
state.payload={sourceRevisionAtomic:'abcdef',qualification};
await ctx.check();
assert.equal(ctx.composition20.qualification.ok,false,'Together blocks a missing qualification');
ctx.composition20.mode='SEPARATELY';
await ctx.check();
assert.equal(ctx.composition20.qualification.ok,true,'GAP separately is permitted');
ctx.composition20.selectedScope='grasp';
await ctx.check();
assert.equal(ctx.composition20.qualification.ok,false,'GRASP separately is blocked');
state.payload={sourceRevisionAtomic:'stale',qualification:{...qualification,qualifiedForAllScopes:true}};
ctx.composition20.mode='TOGETHER';
await ctx.check();
assert.equal(ctx.composition20.qualification.ok,false,'stale evidence fails closed');
assert.equal(state.fetches,4);
assert.ok(source.includes("verifyScopeAuditor20()"),'qualified source refresh is wired');
assert.ok(source.includes('composition20.qualification?.key!==qualificationKey'),
 'Save requires qualification evidence for the current mode, scope, auditor and revision');
assert.ok(source.includes("for(const person of payload[1].auditors||[])"),
 'Model C selection must include the full canonical roster, not the legacy all-scope candidate subset');
assert.ok(source.includes("a.candidateAuditors.push(candidate)"),
 'Model C roster candidates must be accessible to the existing Planner validator');
assert.ok(source.includes("renderDraft();verifyScopeAuditor20();loadRotation()"),
 'New Model C auditor candidates must undergo both qualification and rotation checks');
console.log('Issue #87: canonical auditor qualification gates Together and each Separate scope PASS');
