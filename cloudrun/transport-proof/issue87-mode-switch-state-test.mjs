import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const extract=(name,next)=>{const start=code.indexOf('function '+name+'('),end=code.indexOf('function '+next+'(',start);assert.ok(start>=0&&end>start,name);return code.slice(start,end)};
const auditor={value:'a@example.com',options:[{value:''},{value:'a@example.com'},{value:'b@example.com'}]};
const fields={'#auditor':auditor,'#date':{value:''},'#comment':{value:''}};
const a={date:'2027-03-11',start:'09:00',end:'15:00'};
const ctx={
 composition20:{scopes:[{obligationId:'gap'},{obligationId:'grasp'}],mode:'TOGETHER',
  selectedScope:'gap',separateDrafts:new Map(),togetherDraft:[a],partialLineage:false,
  manual:[{blockId:'block',obligationId:'gap',minutes:360}]},
 draftBlocks:[a],
 q:id=>fields[id],calendarAnchor:'2027-03-01',renderDraft:()=>{},verifyScopeAuditor20:()=>{}
};
runInNewContext(extract('saveActiveScopeDraft20','separateVisitsDraft20')+
 extract('switchScopeDraft20','switchMode20')+
 extract('switchMode20','renderScopePlanning20')+
 ';this.switchScope=switchScopeDraft20;this.switchMode=switchMode20;',ctx);
ctx.switchMode('SEPARATELY');
assert.equal(ctx.composition20.mode,'SEPARATELY');
ctx.draftBlocks=[{date:'2027-04-01',start:'09:00',end:'12:00'}];
ctx.switchScope('grasp');
assert.equal(auditor.value,'','scope with no auditor must not inherit previous scope auditor');
auditor.value='b@example.com';
ctx.draftBlocks=[{date:'2027-04-02',start:'09:00',end:'12:00'}];
ctx.switchScope('gap');
assert.equal(auditor.value,'a@example.com','first scope restores its own auditor');
ctx.switchScope('grasp');
assert.equal(auditor.value,'b@example.com','second scope restores its own auditor');
ctx.switchMode('TOGETHER');
assert.equal(auditor.value,'a@example.com','Together restores its auditor');
assert.equal(ctx.composition20.manual[0].minutes,360,'Together restores manually configured scope allocation');
assert.equal(ctx.draftBlocks[0].date,'2027-03-11','Together restores its calendar draft');
console.log('Issue #87: Together/Separately drafts and auditor identity isolation PASS');
